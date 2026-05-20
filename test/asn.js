'use strict'

const assert = require('node:assert/strict')
const { describe, it } = require('node:test')
const path = require('node:path')

const fixtures = require('haraka-test-fixtures')

function makePlugin() {
  const p = new fixtures.plugin('asn')
  p.config = p.config.module_config(path.resolve('test'))
  p.load_asn_ini()
  return p
}

function makeConnection() {
  const c = fixtures.connection.createConnection()
  c.init_transaction()
  return c
}

describe('get_result', () => {
  const plugin = makePlugin()

  const cases = [
    {
      zone: 'origin.asn.cymru.com',
      first: ['40431 | 208.75.176.0/21 | US | arin | 2007-03-02'],
      asn: '40431',
      net: '208.75.176.0/21',
    },
    {
      zone: 'asn.routeviews.org',
      first: ['40431', '208.75.176.0', '21'],
      asn: '40431',
      net: '208.75.176.0/21',
    },
    {
      zone: 'asn.rspamd.com',
      first: ['15169|8.8.8.0/24|US|arin|'],
      asn: '15169',
      net: '8.8.8.0/24',
    },
    {
      zone: 'origin.asn.spameatingmonkey.net',
      first: ['74.125.44.0/23 | AS15169 | Google Inc. | 2000-03-30'],
      asn: '15169',
      net: '74.125.44.0/23',
    },
  ]

  for (const { zone, first, asn, net } of cases) {
    it(zone, () => {
      const r = plugin.get_result(zone, first)
      assert.equal(r.asn, asn)
      assert.equal(r.net, net)
    })
  }

  it('unknown zone returns undefined', () => {
    assert.equal(plugin.get_result('unknown.example.com', ['data']), undefined)
  })
})

describe('add_header_asn', () => {
  it('skips when no asn result', async () => {
    const plugin = makePlugin()
    const connection = makeConnection()
    await new Promise((resolve) => plugin.add_header_asn(resolve, connection))
    assert.equal(connection.transaction.header.get('X-Haraka-ASN'), '')
  })

  it('skips when no transaction', async () => {
    const plugin = makePlugin()
    const connection = makeConnection()
    connection.results.add(plugin, { asn: '15169' })
    connection.transaction = null
    await new Promise((resolve) => plugin.add_header_asn(resolve, connection))
  })

  it('adds X-Haraka-ASN with asn and net', async () => {
    const plugin = makePlugin()
    const connection = makeConnection()
    connection.results.add(plugin, { asn: '15169', net: '8.8.8.0/24' })
    await new Promise((resolve) => plugin.add_header_asn(resolve, connection))
    assert.equal(connection.transaction.header.get('X-Haraka-ASN'), '15169 8.8.8.0/24')
  })

  it('adds X-Haraka-ASN with asn only when net absent', async () => {
    const plugin = makePlugin()
    const connection = makeConnection()
    connection.results.add(plugin, { asn: '15169' })
    await new Promise((resolve) => plugin.add_header_asn(resolve, connection))
    assert.equal(connection.transaction.header.get('X-Haraka-ASN'), '15169')
  })

  it('adds X-Haraka-ASN-Org when org present', async () => {
    const plugin = makePlugin()
    const connection = makeConnection()
    connection.results.add(plugin, { asn: '15169', net: '8.8.8.0/24', org: 'GOOGLE' })
    await new Promise((resolve) => plugin.add_header_asn(resolve, connection))
    assert.equal(connection.transaction.header.get('X-Haraka-ASN-Org'), 'GOOGLE')
  })
})

describe('add_header_provider', () => {
  it('skips when no asn result', async () => {
    const plugin = makePlugin()
    const connection = makeConnection()
    await new Promise((resolve) => plugin.add_header_provider(resolve, connection))
    assert.equal(connection.transaction.header.get('X-Haraka-ASN-CYMRU'), '')
  })

  it('adds X-Haraka-ASN-CYMRU from cymru provider data', async () => {
    const plugin = makePlugin()
    const connection = makeConnection()
    connection.results.add(plugin, {
      asn: '15169',
      cymru: {
        asn: '15169',
        net: '8.8.8.0/24',
        country: 'US',
        assignor: 'arin',
        date: '2015-03-14',
      },
    })
    await new Promise((resolve) => plugin.add_header_provider(resolve, connection))
    const h = connection.transaction.header.get('X-Haraka-ASN-CYMRU')
    assert.ok(h.includes('asn=15169'), `header "${h}" includes asn=15169`)
    assert.ok(h.includes('net=8.8.8.0/24'), `header "${h}" includes net=8.8.8.0/24`)
    assert.ok(h.includes('country=US'), `header "${h}" includes country=US`)
  })
})

describe('lookup_via_dns', () => {
  it('skips when protocols.dns is disabled at runtime', async () => {
    const plugin = makePlugin()
    // Replace cfg entirely to avoid mutating haraka-config's shared cached object
    plugin.cfg = { ...plugin.cfg, protocols: { ...plugin.cfg.protocols, dns: false } }
    const connection = fixtures.connection.createConnection()
    connection.remote.ip = '8.8.8.8'
    await new Promise((resolve) => plugin.lookup_via_dns(resolve, connection))
    assert.ok(!connection.results.get(plugin)?.asn, 'no asn stored when dns disabled')
  })

  it('skips private IPs', async () => {
    const plugin = makePlugin()
    const connection = fixtures.connection.createConnection()
    connection.remote.ip = '192.168.1.1'
    connection.remote.is_private = true
    await new Promise((resolve) => plugin.lookup_via_dns(resolve, connection))
    assert.ok(!connection.results.get(plugin)?.asn, 'no asn stored for private IP')
  })

  it('skips when asn already set', async () => {
    const plugin = makePlugin()
    const connection = fixtures.connection.createConnection()
    connection.remote.ip = '8.8.8.8'
    connection.results.add(plugin, { asn: '99999' })
    await new Promise((resolve) => plugin.lookup_via_dns(resolve, connection))
    assert.equal(connection.results.get(plugin).asn, '99999')
  })

  it('populates asn and net from live DNS', { timeout: 8000 }, async () => {
    const plugin = makePlugin()
    const connection = fixtures.connection.createConnection()
    connection.remote.ip = '66.128.51.163'
    await plugin.test_and_register_dns_providers()
    await new Promise((resolve) => {
      plugin.lookup_via_dns((rc) => {
        assert.equal(rc, undefined)
        const r = connection.results.get(plugin)
        assert.ok(r.asn, 'result has asn')
        assert.ok(r.net, 'result has net')
        resolve()
      }, connection)
    })
  })
})

describe('get_dns_results', () => {
  const plugin = makePlugin()

  // 8.8.8.8 is Google's DNS, owned by AS15169 — stable reference point
  const cases = [
    { zone: 'origin.asn.cymru.com', ip: '8.8.8.8', asn: '15169', net: '8.8.8.0/24' },
    { zone: 'asn.rspamd.com', ip: '8.8.8.8', asn: '15169', net: '8.8.8.0/24' },
    {
      zone: 'origin.asn.spameatingmonkey.net',
      ip: '8.8.8.8',
      asn: '15169',
      net: '8.8.8.0/24',
    },
  ]

  for (const { zone, ip, asn, net } of cases) {
    it(zone, { timeout: 6000 }, async () => {
      const r = await plugin.get_dns_results(zone, ip)
      if (!r) {
        console.error(`WARN: ${zone} returned no result — service may be down`)
        return
      }
      assert.equal(r.asn, asn, `${zone} asn`)
      assert.equal(r.net, net, `${zone} net`)
    })
  }

  // routeviews returns an array TXT record; just verify shape
  it('asn.routeviews.org returns usable asn+net', { timeout: 6000 }, async () => {
    const r = await plugin.get_dns_results('asn.routeviews.org', '8.8.8.8')
    if (!r) {
      console.error('WARN: asn.routeviews.org returned no result — service may be down')
      return
    }
    assert.ok(r.asn, 'has asn')
    assert.ok(r.net, 'has net')
    assert.match(r.net, /\/\d+$/, 'net is in CIDR notation')
  })

  it('returns undefined for IPv6 addresses without making a DNS query', async () => {
    const p = makePlugin()
    assert.equal(await p.get_dns_results('origin.asn.cymru.com', '2001:db8::1'), undefined)
    assert.equal(await p.get_dns_results('origin.asn.cymru.com', '::1'), undefined)
  })

  it('returns undefined for non-IP input', async () => {
    const p = makePlugin()
    assert.equal(await p.get_dns_results('origin.asn.cymru.com', 'not-an-ip'), undefined)
  })
})

describe('load_asn_ini', () => {
  const withCfg = (main) => {
    const p = new fixtures.plugin('asn')
    p.config.get = () => ({
      main,
      header: { asn: true, provider: false },
      protocols: { dns: true, geoip: true },
    })
    p.load_asn_ini()
    return p
  }

  it('empty providers string disables all dns providers', async () => {
    const p = withCfg({ providers: '' })
    let called = false
    p.get_dns_results = async () => {
      called = true
      return { asn: '1' }
    }
    await p.test_and_register_dns_providers()
    assert.equal(called, false) // no zones to query
  })

  it('parses a delimited providers list and a custom test_ip', async () => {
    const p = withCfg({ providers: 'a.example b.example', test_ip: '1.2.3.4' })
    const seen = []
    p.get_dns_results = async (zone) => {
      seen.push(zone)
      return null // force the "failed" branch
    }
    await p.test_and_register_dns_providers()
    assert.deepEqual(seen, ['a.example', 'b.example'])
  })
})

describe('test_and_register_dns_providers', () => {
  it('returns early when protocols.dns is disabled', async () => {
    const p = makePlugin()
    p.cfg.protocols.dns = false
    assert.equal(await p.test_and_register_dns_providers(), undefined)
  })

  const pinned = (providers) => {
    const p = new fixtures.plugin('asn')
    p.config.get = () => ({
      main: { providers },
      header: {},
      protocols: { dns: true, geoip: false },
    })
    p.load_asn_ini()
    return p
  }

  it('registers the lookup_rdns hook on first success', async () => {
    const p = pinned('origin.asn.cymru.com')
    p.get_dns_results = async () => ({ asn: '15169' })
    await p.test_and_register_dns_providers()
    assert.ok(p.hooks.lookup_rdns?.includes('lookup_via_dns'))
  })

  it('logs and continues when a zone throws', async () => {
    const p = pinned('z.example')
    let called = false
    p.get_dns_results = async () => {
      called = true
      throw new Error('dns boom')
    }
    await assert.doesNotReject(() => p.test_and_register_dns_providers())
    assert.equal(called, true)
  })
})

describe('lookup_via_dns provider routing', () => {
  it('stores per-provider results for each zone', async () => {
    const p = new fixtures.plugin('asn')
    p.config.get = () => ({
      main: {
        providers:
          'origin.asn.cymru.com asn.routeviews.org asn.rspamd.com origin.asn.spameatingmonkey.net',
      },
      header: {},
      protocols: { dns: true, geoip: false },
    })
    p.load_asn_ini()
    p.get_dns_results = async () => ({ asn: '15169', net: '8.8.8.0/24' })
    await p.test_and_register_dns_providers()

    const connection = fixtures.connection.createConnection()
    connection.remote.ip = '8.8.8.8'
    await new Promise((resolve) => p.lookup_via_dns(resolve, connection))

    const r = connection.results.get(p)
    assert.equal(r.asn, '15169')
    assert.ok(r.cymru && r.routeviews && r.rspamd && r.monkey)
  })

  it('captures a synchronous get_dns_results throw as an err result', async () => {
    const p = new fixtures.plugin('asn')
    p.config.get = () => ({
      main: { providers: 'origin.asn.cymru.com' },
      header: {},
      protocols: { dns: true, geoip: false },
    })
    p.load_asn_ini()
    p.get_dns_results = async () => ({ asn: '1' })
    await p.test_and_register_dns_providers()
    p.get_dns_results = () => {
      throw new Error('sync boom')
    }
    const connection = fixtures.connection.createConnection()
    connection.remote.ip = '8.8.8.8'
    await new Promise((resolve) => p.lookup_via_dns(resolve, connection))
    assert.ok(connection.results.get(p).err.length)
  })
})

describe('geoip / maxmind', () => {
  it('test_and_register_geoip returns early when geoip disabled', async () => {
    const p = makePlugin()
    p.cfg.protocols.geoip = false
    await p.test_and_register_geoip()
    assert.ok(!p.hooks?.lookup_rdns?.includes('lookup_via_maxmind'))
  })

  it('test_and_register_geoip logs when load_dbs throws', async () => {
    const p = makePlugin()
    p.cfg.protocols.geoip = true
    p.load_dbs = async () => {
      throw new Error('maxmind boom')
    }
    await assert.doesNotReject(() => p.test_and_register_geoip())
  })

  it('load_dbs returns 0 when the db file is absent', async () => {
    const p = makePlugin()
    p.cfg.main.dbdir = '/no/such/dir/at/all'
    p.maxmind = require('maxmind')
    assert.equal(await p.load_dbs(), 0)
  })

  it('lookup_via_maxmind passes through without a loaded db', async () => {
    const p = makePlugin()
    p.maxmind = null
    const connection = fixtures.connection.createConnection()
    let called
    p.lookup_via_maxmind((rc) => (called = rc), connection)
    assert.equal(called, undefined)
  })

  it('lookup_via_maxmind records asn/org from a db hit', async () => {
    const p = makePlugin()
    p.maxmind = {}
    p.dbsLoaded = 1
    p.lookup = {
      get: () => ({
        autonomous_system_number: 15169,
        autonomous_system_organization: 'GOOGLE',
      }),
    }
    const connection = fixtures.connection.createConnection()
    connection.remote.ip = '8.8.8.8'
    await new Promise((resolve) => p.lookup_via_maxmind(resolve, connection))
    const r = connection.results.get(p)
    assert.equal(r.asn, 15169)
    assert.equal(r.org, 'GOOGLE')
  })
})

describe('load_asn_ini hot-reload', () => {
  it('clears providers and re-runs DNS registration on config file change', async () => {
    const p = new fixtures.plugin('asn')
    let reloadCallback

    p.config.get = (filename, opts, cb) => {
      reloadCallback = cb
      return { main: {}, header: {}, protocols: { dns: true, geoip: false } }
    }

    let registerCount = 0
    p.test_and_register_dns_providers = async () => {
      registerCount++
    }

    p.load_asn_ini()
    assert.equal(registerCount, 0, 'not called during initial load')
    assert.ok(reloadCallback, 'hot-reload callback was captured')

    reloadCallback()
    // Allow the async test_and_register_dns_providers to be scheduled
    await new Promise((resolve) => setImmediate(resolve))

    assert.equal(registerCount, 1, 'called once on reload')
  })
})

describe('register', () => {
  it('registers data_post hooks per header config', async () => {
    const p = new fixtures.plugin('asn')
    p.config.get = () => ({
      main: {},
      header: { asn: true, provider: true },
      protocols: { dns: false, geoip: false },
    })
    p.test_and_register_geoip = async () => {}
    p.test_and_register_dns_providers = async () => {}
    await p.register()
    assert.ok(p.hooks.data_post.includes('add_header_asn'))
    assert.ok(p.hooks.data_post.includes('add_header_provider'))
  })
})
