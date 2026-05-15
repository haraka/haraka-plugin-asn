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
})
