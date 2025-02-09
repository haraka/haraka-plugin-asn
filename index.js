// determine the ASN of the connecting IP

const dns = require('node:dns').promises
const fs = require('node:fs/promises')
const path = require('node:path')

let test_ip = '66.128.51.163'
const providers = []
let conf_providers = [
  'origin.asn.cymru.com',
  'asn.routeviews.org',
  'asn.rspamd.com',
]

exports.register = async function () {
  this.registered = false

  this.load_asn_ini()

  await this.test_and_register_geoip()
  await this.test_and_register_dns_providers()

  if (this.cfg.header.asn) {
    this.register_hook('data_post', 'add_header_asn')
  }
  if (this.cfg.header.provider) {
    this.register_hook('data_post', 'add_header_provider')
  }
}

exports.test_and_register_dns_providers = async function () {
  if (!this.cfg.protocols.dns) return // disabled in config

  for (const zone of conf_providers) {
    try {
      const res = await this.get_dns_results(zone, test_ip)
      if (!res) {
        this.logerror(this, `${zone} failed`)
        continue
      }

      this.logdebug(this, `${zone} succeeded`)

      if (!providers.includes(zone)) providers.push(zone)
      if (this.registered) continue
      this.registered = true
      this.register_hook('lookup_rdns', 'lookup_via_dns')
    } catch (err) {
      this.logerror(this, `zone ${zone} encountered ${err.message}`)
    }
  }
  return providers
}

exports.load_asn_ini = function () {
  const plugin = this
  plugin.cfg = plugin.config.get(
    'asn.ini',
    {
      booleans: [
        '+header.asn',
        '-header.provider',
        '+protocols.dns',
        '+protocols.geoip',
      ],
    },
    function () {
      plugin.load_asn_ini()
    },
  )

  const c = plugin.cfg
  if (c.main.providers !== undefined) {
    if (c.main.providers === '') {
      conf_providers = []
    } else {
      conf_providers = c.main.providers.split(/[\s,;]+/)
    }
  }

  if (c.main.test_ip) test_ip = c.main.test_ip
}

exports.get_dns_results = async function (zone, ip) {
  const query = `${ip.split('.').reverse().join('.')}.${zone}`

  const timeout = (prom, time, exception) => {
    let timer
    return Promise.race([
      prom,
      new Promise((_r, rej) => (timer = setTimeout(rej, time, exception))),
    ]).finally(() => clearTimeout(timer))
  }

  try {
    const addrs = await timeout(
      dns.resolveTxt(query),
      (this.cfg.main.timeout || 4) * 1000,
      new Error(`${zone} timeout`),
    )

    if (!addrs || !addrs[0]) {
      this.logerror(this, `no results for ${query}`)
      return
    }

    const first = addrs[0]

    this.logdebug(this, `${zone} answers: ${first}`)

    return this.get_result(zone, first)
  } catch (err) {
    this.logerror(this, `error: ${err} running: ${query}`)
  }
}

exports.get_result = function (zone, first) {
  switch (zone) {
    case 'origin.asn.cymru.com':
      return this.parse_cymru(first.join(''))
    case 'asn.routeviews.org':
      return this.parse_routeviews(first)
    case 'asn.rspamd.com':
      return this.parse_rspamd(first.join(''))
    case 'origin.asn.spameatingmonkey.net':
      return this.parse_monkey(first.join(''))
  }

  this.logerror(this, `unrecognized ASN provider: ${zone}`)
  return
}

exports.lookup_via_dns = function (next, connection) {
  if (connection.remote.is_private) return next()

  if (connection.results.get(this)?.asn) return next() // already set, skip

  const promises = []

  for (const zone of providers) {
    promises.push(
      new Promise((resolve) => {
        // connection.loginfo(plugin, `zone: ${zone}`);

        try {
          this.get_dns_results(zone, connection.remote.ip).then((r) => {
            if (!r) return resolve()

            // store asn & net from any source
            if (r.asn) connection.results.add(this, { asn: r.asn })
            if (r.net) connection.results.add(this, { net: r.net })

            // store provider specific results
            switch (zone) {
              case 'origin.asn.cymru.com':
                connection.results.add(this, { cymru: r })
                break
              case 'asn.routeviews.org':
                connection.results.add(this, { routeviews: r })
                break
              case 'origin.asn.spameatingmonkey.net':
                connection.results.add(this, { monkey: r })
                break
              case 'asn.rspamd.com':
                connection.results.add(this, { rspamd: r })
                break
            }

            resolve()
          })
        } catch (err) {
          connection.results.add(this, { err })
          resolve()
        }
      }),
    )
  }

  Promise.all(promises)
    .then(() => {
      connection.results.add(this, {emit: true})
      next()
    })
}

exports.parse_routeviews = function (thing) {
  let labels

  if (typeof thing === 'string' && /,/.test(thing)) {
    labels = thing.split(',')
    return { asn: labels[0], net: `${labels[1]}/${labels[2]}` }
  }

  // this is a correct result (node >= 0.10.26)
  // 99.177.75.208.asn.routeviews.org. IN TXT "40431" "208.75.176.0" "21"
  if (Array.isArray(thing)) {
    labels = thing
  } else {
    // this is what node (< 0.10.26) returns
    // 99.177.75.208.asn.routeviews.org. IN TXT "40431208.75.176.021"
    labels = thing.split(/ /)
  }

  if (labels.length !== 3) {
    this.logerror(
      this,
      `result length not 3: ${labels.length} string="${thing}"`,
    )
    return
  }

  return { asn: labels[0], net: `${labels[1]}/${labels[2]}` }
}

exports.parse_cymru = function (str) {
  const r = str.split(/\s+\|\s*/)
  //  99.177.75.208.origin.asn.cymru.com. 14350 IN TXT
  //        "40431 | 208.75.176.0/21 | US | arin | 2007-03-02"
  //        "10290 | 12.129.48.0/24  | US | arin |"
  if (r.length < 4) {
    this.logerror(this, `cymru: bad result length ${r.length} string="${str}"`)
    return
  }
  return { asn: r[0], net: r[1], country: r[2], assignor: r[3], date: r[4] }
}

exports.parse_monkey = function (str) {
  const plugin = this
  const r = str.split(/\s+\|\s+/)
  // "74.125.44.0/23 | AS15169 | Google Inc. | 2000-03-30"
  // "74.125.0.0/16 | AS15169 | Google Inc. | 2000-03-30 | US"
  if (r.length < 3) {
    plugin.logerror(
      plugin,
      `monkey: bad result length ${r.length} string="${str}"`,
    )
    return
  }
  return {
    asn: r[1].substring(2),
    net: r[0],
    org: r[2],
    date: r[3],
    country: r[4],
  }
}

exports.parse_rspamd = function (str) {
  const plugin = this
  const r = str.split(/\s*\|\s*/)
  //  8.8.8.8.asn.rspamd.com. 14350 IN TXT
  //        "15169|8.8.8.0/24|US|arin|"

  if (r.length < 4) {
    plugin.logerror(
      plugin,
      `rspamd: bad result length ${r.length} string="${str}"`,
    )
    return
  }
  return { asn: r[0], net: r[1], country: r[2], assignor: r[3], date: r[4] }
}

exports.add_header_asn = function (next, connection) {
  const asn = connection.results.get('asn')
  if (!asn?.asn) return next()
  if (!connection.transaction) return next()

  if (asn.net) {
    connection.transaction.add_header('X-Haraka-ASN', `${asn.asn} ${asn.net}`)
  } else {
    connection.transaction.add_header('X-Haraka-ASN', `${asn.asn}`)
  }
  if (asn.org) {
    connection.transaction.add_header('X-Haraka-ASN-Org', `${asn.org}`)
  }

  next()
}

exports.add_header_provider = function (next, connection) {
  const asn = connection.results.get('asn')
  if (!asn?.asn) return next()

  for (const p in asn) {
    if (!asn[p].asn) continue // ignore non-object results

    const name = `X-Haraka-ASN-${p.toUpperCase()}`
    const values = []
    for (const k in asn[p]) {
      values.push(`${k}=${asn[p][k]}`)
    }
    if (values.length === 0) continue
    connection.transaction.add_header(name, values.join(' '))
  }

  next()
}

exports.test_and_register_geoip = async function () {
  if (!this.cfg.protocols.geoip) return // disabled in config

  try {
    this.maxmind = require('maxmind')
    if (await this.load_dbs()) {
      this.register_hook('lookup_rdns', 'lookup_via_maxmind')
    }
  } catch (e) {
    this.logerror(e)
    this.logerror(
      "unable to load maxmind, try\n\n\t'npm install -g maxmind@0.6'\n\n",
    )
  }
}

exports.load_dbs = async function () {
  this.dbsLoaded = 0
  const dbdir = this.cfg.main.dbdir || '/usr/local/share/GeoIP/'
  const dbPath = path.join(dbdir, `GeoLite2-ASN.mmdb`)

  try {
    await fs.access(dbPath)

    this.lookup = await this.maxmind.open(dbPath, {
      // this causes tests to hang, which is why mocha runs with --exit
      watchForUpdates: true,
      cache: {
        max: 1000, // max items in cache
        maxAge: 1000 * 60 * 60, // life time in milliseconds
      },
    })

    this.loginfo(`loaded maxmind db ${dbPath}`)
    this.dbsLoaded++
  } catch (e) {
    console.error(e)
    this.loginfo(`missing [access to] DB ${dbPath}`)
  }

  return this.dbsLoaded
}

exports.lookup_via_maxmind = function (next, connection) {
  if (!this.maxmind || !this.dbsLoaded) return next()

  if (connection.results.get(this)?.asn) return next() // already set, skip

  const asn = this.lookup.get(connection.remote.ip)

  if (asn?.autonomous_system_number) {
    connection.results.add(this, { asn: asn.autonomous_system_number })
  }
  if (asn?.autonomous_system_organization) {
    connection.results.add(this, { org: asn.autonomous_system_organization })
  }
  connection.results.add(this, { emit: true })

  next()
}
