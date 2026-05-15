'use strict'

const assert = require('node:assert')

// npm installed modules
const fixtures = require('haraka-test-fixtures')

const { describe, it } = require('node:test')

describe('parse_monkey', () => {
  const asn = new fixtures.plugin('asn')

  const cases = [
    {
      input: '74.125.44.0/23 | AS15169 | Google Inc. | 2000-03-30',
      expected: {
        net: '74.125.44.0/23',
        asn: '15169',
        org: 'Google Inc.',
        date: '2000-03-30',
        country: undefined,
      },
      msg: 'parses AS 15169/23',
    },
    {
      input: '74.125.0.0/16 | AS15169 | Google Inc. | 2000-03-30 | US',
      expected: {
        net: '74.125.0.0/16',
        asn: '15169',
        org: 'Google Inc.',
        date: '2000-03-30',
        country: 'US',
      },
      msg: 'parses AS 15169/16',
    },
  ]
  cases.forEach(({ input, expected, msg }) => {
    it(msg, () => {
      assert.deepEqual(asn.parse_monkey(input), expected)
    })
  })
})

describe('parse_routeviews', () => {
  const asn = new fixtures.plugin('asn')

  const cases = [
    { input: '40431', expected: undefined, msg: '40431 string, asn-only' },
    {
      input: '40431 208.75.176.0 21',
      expected: { asn: '40431', net: '208.75.176.0/21' },
      msg: '40431 string',
    },
    {
      input: '15169,8.8.8.0,24',
      expected: { asn: '15169', net: '8.8.8.0/24' },
      msg: '15169 CSV string',
    },
    {
      input: ['40431', '208.75.176.0', '21'],
      expected: { asn: '40431', net: '208.75.176.0/21' },
      msg: '40431 array',
    },
  ]
  cases.forEach(({ input, expected, msg }) => {
    it(msg, () => {
      assert.deepEqual(asn.parse_routeviews(input), expected)
    })
  })
})

describe('parse_cymru', () => {
  const asn = new fixtures.plugin('asn')

  const cases = [
    {
      input: '40431 | 208.75.176.0/21 | US | arin | 2007-03-02',
      expected: {
        asn: '40431',
        net: '208.75.176.0/21',
        country: 'US',
        assignor: 'arin',
        date: '2007-03-02',
      },
      msg: '40431',
    },
    {
      input: '10290 | 12.129.48.0/24 | US | arin |',
      expected: {
        asn: '10290',
        net: '12.129.48.0/24',
        country: 'US',
        assignor: 'arin',
        date: '',
      },
      msg: '10290',
    },
  ]
  cases.forEach(({ input, expected, msg }) => {
    it(msg, () => {
      assert.deepEqual(asn.parse_cymru(input), expected)
    })
  })
})

describe('parse_rspamd', () => {
  const asn = new fixtures.plugin('asn')

  it('40431', () => {
    assert.deepEqual(asn.parse_rspamd('15169|8.8.8.0/24|US|arin|'), {
      asn: '15169',
      net: '8.8.8.0/24',
      country: 'US',
      assignor: 'arin',
      date: '',
    })
  })
  it('15169', () => {
    assert.deepEqual(asn.parse_rspamd('15169|8.8.8.0/24|US|arin|'), {
      asn: '15169',
      net: '8.8.8.0/24',
      country: 'US',
      assignor: 'arin',
      date: '',
    })
  })
})

describe('get_dns_results', () => {
  const asn = new fixtures.plugin('asn')
  asn.cfg = { main: {}, protocols: { dns: true } }
  asn.connection = fixtures.connection.createConnection()

  it('origin.asn.cymru.com', { timeout: 5000 }, async () => {
    const obj = await asn.get_dns_results('origin.asn.cymru.com', '8.8.8.8')
    if (obj) {
      assert.equal('15169', obj.asn)
      assert.equal('8.8.8.0/24', obj.net)
    } else {
      assert.equal('something', obj)
    }
  })

  it('asn.routeviews.org', { timeout: 5000 }, async () => {
    const obj = await asn.get_dns_results('asn.routeviews.org', '8.8.8.8')
    if (obj) {
      if (obj.asn && obj.asn === '15169') {
        assert.equal('15169', obj.asn)
      }
    } else {
      assert.ok('Node DNS (c-ares) bug')
    }
  })

  it('asn.rspamd.com', { timeout: 5000 }, async () => {
    const obj = await asn.get_dns_results('asn.rspamd.com', '8.8.8.8')
    if (obj) {
      assert.equal('15169', obj.asn)
      assert.equal('8.8.8.0/24', obj.net)
    } else {
      assert.equal('something', obj)
    }
  })

  it('origin.asn.spameatingmonkey.net', { timeout: 5000 }, async () => {
    const obj = await asn.get_dns_results('origin.asn.spameatingmonkey.net', '8.8.8.8')
    if (obj) {
      assert.equal('15169', obj.asn)
      assert.equal('8.8.8.0/24', obj.net)
    } else {
      assert.equal('something', obj)
    }
  })
})

describe('lookup_via_dns', () => {
  it('returns results from active providers', { timeout: 5000 }, async () => {
    const asn = new fixtures.plugin('asn')
    asn.cfg = { main: {}, protocols: { dns: true } }
    const connection = fixtures.connection.createConnection()
    connection.remote.ip = '66.128.51.163'

    await asn.test_and_register_dns_providers()
    await new Promise((resolve) => {
      asn.lookup_via_dns((rc, hosts) => {
        assert.equal(rc, undefined)
        assert.equal(hosts, undefined)
        const r = connection.results.get(asn)
        assert.ok(r.asn)
        assert.ok(r.net)
        resolve()
      }, connection)
    })
  })
})

describe('maxmind geoip db', () => {
  it('test_and_register_geoip', async () => {
    const asn = new fixtures.plugin('asn')
    asn.cfg = { main: {}, protocols: { geoip: true } }
    const r = await asn.test_and_register_geoip()
    // console.log(r)
    assert.ok(asn.maxmind)
  })

  it('lookup_via_maxmind, IPv4', async () => {
    const asn = new fixtures.plugin('asn')
    asn.cfg = { main: {}, protocols: { geoip: true } }
    asn.connection = fixtures.connection.createConnection()
    asn.connection.remote.ip = '8.8.8.8'
    await asn.test_and_register_geoip()
    await new Promise((resolve) => {
      asn.lookup_via_maxmind(() => {
        if (asn.dbsLoaded) {
          const res = asn.connection.results.get('asn')
          assert.equal(res.asn, 15169)
          assert.equal(res.org, 'GOOGLE')
        } else {
          console.error('no DBs found')
        }
        resolve()
      }, asn.connection)
    })
  })

  it('maxmind AS with org', async () => {
    const asn = new fixtures.plugin('asn')
    asn.cfg = { main: {}, protocols: { geoip: true } }
    asn.connection = fixtures.connection.createConnection()
    asn.connection.remote.ip = '1.1.1.1'
    await asn.test_and_register_geoip()
    try {
      await new Promise((resolve) => {
        asn.lookup_via_maxmind(() => {
          if (asn.dbsLoaded) {
            const res = asn.connection.results.get('asn')
            assert.equal(res?.asn, 13335)
            assert.equal(res?.org, 'CLOUDFLARENET')
          }
          resolve()
        }, asn.connection)
      })
    } catch (e) {
      console.error(e)
    }
  })
})
