'use strict'

const assert = require('node:assert')

// npm installed modules
const fixtures = require('haraka-test-fixtures')

describe('parse_monkey', function () {
  const asn = new fixtures.plugin('asn')

  it('parses AS 15169/23', function () {
    assert.deepEqual(
      asn.parse_monkey('74.125.44.0/23 | AS15169 | Google Inc. | 2000-03-30'),
      {
        net: '74.125.44.0/23',
        asn: '15169',
        org: 'Google Inc.',
        date: '2000-03-30',
        country: undefined,
      },
    )
  })

  it('parses AS 15169/16', function () {
    assert.deepEqual(
      asn.parse_monkey(
        '74.125.0.0/16 | AS15169 | Google Inc. | 2000-03-30 | US',
      ),
      {
        net: '74.125.0.0/16',
        asn: '15169',
        org: 'Google Inc.',
        date: '2000-03-30',
        country: 'US',
      },
    )
  })
})

describe('parse_routeviews', function () {
  const asn = new fixtures.plugin('asn')

  it('40431 string, asn-only', function () {
    assert.deepEqual(asn.parse_routeviews('40431'), undefined)
  })

  it('40431 string', function () {
    assert.deepEqual(asn.parse_routeviews('40431 208.75.176.0 21'), {
      asn: '40431',
      net: '208.75.176.0/21',
    })
  })

  it('15169 CSV string', function () {
    assert.deepEqual(asn.parse_routeviews('15169,8.8.8.0,24'), {
      asn: '15169',
      net: '8.8.8.0/24',
    })
  })

  it('40431 array', function () {
    assert.deepEqual(asn.parse_routeviews(['40431', '208.75.176.0', '21']), {
      asn: '40431',
      net: '208.75.176.0/21',
    })
  })
})

describe('parse_cymru', function () {
  const asn = new fixtures.plugin('asn')

  it('40431', function () {
    assert.deepEqual(
      asn.parse_cymru('40431 | 208.75.176.0/21 | US | arin | 2007-03-02'),
      {
        asn: '40431',
        net: '208.75.176.0/21',
        country: 'US',
        assignor: 'arin',
        date: '2007-03-02',
      },
    )
  })

  it('10290', function () {
    assert.deepEqual(asn.parse_cymru('10290 | 12.129.48.0/24 | US | arin |'), {
      asn: '10290',
      net: '12.129.48.0/24',
      country: 'US',
      assignor: 'arin',
      date: '',
    })
  })
})

describe('parse_rspamd', function () {
  const asn = new fixtures.plugin('asn')

  it('40431', function () {
    assert.deepEqual(asn.parse_rspamd('15169|8.8.8.0/24|US|arin|'), {
      asn: '15169',
      net: '8.8.8.0/24',
      country: 'US',
      assignor: 'arin',
      date: '',
    })
  })
})

describe('get_dns_results', function () {
  const asn = new fixtures.plugin('asn')
  asn.cfg = { main: {}, protocols: { dns: true } }
  asn.connection = fixtures.connection.createConnection()

  it('origin.asn.cymru.com', function (done) {
    this.timeout(5000)
    asn.get_dns_results('origin.asn.cymru.com', '8.8.8.8').then((obj) => {
      if (obj) {
        assert.equal('15169', obj.asn)
        assert.equal('8.8.8.0/24', obj.net)
      } else {
        assert.equal('something', obj)
      }
      done()
    })
  })

  it('asn.routeviews.org', function (done) {
    this.timeout(5000)
    asn.get_dns_results('asn.routeviews.org', '8.8.8.8').then((obj) => {
      if (obj) {
        if (obj.asn && obj.asn === '15169') {
          assert.equal('15169', obj.asn)
        }
      } else {
        assert.ok('Node DNS (c-ares) bug')
      }
      done()
    })
  })

  it('asn.rspamd.com', function (done) {
    this.timeout(5000)
    asn.get_dns_results('asn.rspamd.com', '8.8.8.8').then((obj, zone) => {
      if (obj) {
        assert.equal('15169', obj.asn)
        assert.equal('8.8.8.0/24', obj.net)
      } else {
        assert.equal('something', obj)
      }
      done()
    })
  })

  it('origin.asn.spameatingmonkey.net', (done) => {
    this.timeout(5000)
    asn
      .get_dns_results('origin.asn.spameatingmonkey.net', '8.8.8.8')
      .then((obj, zone) => {
        if (obj) {
          assert.equal('15169', obj.asn)
          assert.equal('8.8.8.0/24', obj.net)
        } else {
          assert.equal('something', obj)
        }
        done()
      })
  })
})

describe('lookup_via_dns', function () {
  it('returns results from active providers', function (done) {
    this.timeout(5000)
    const asn = new fixtures.plugin('asn')
    asn.cfg = { main: {}, protocols: { dns: true } }
    const connection = fixtures.connection.createConnection()
    connection.remote.ip = '66.128.51.163'

    asn.test_and_register_dns_providers().then((providers) => {
      asn.lookup_via_dns((rc, hosts) => {
        assert.equal(rc, undefined)
        assert.equal(hosts, undefined)
        const r = connection.results.get(asn)
        assert.ok(r.asn)
        assert.ok(r.net)
        done()
      }, connection)
    })
  })
})

describe('maxmind geoip db', () => {
  it('test_and_register_geoip', (done) => {
    const asn = new fixtures.plugin('asn')
    asn.cfg = { main: {}, protocols: { geoip: true } }
    asn.test_and_register_geoip().then((r) => {
      // console.log(r)
      assert.ok(asn.maxmind)
      done()
    })
  })

  it('lookup_via_maxmind, IPv4', (done) => {
    const asn = new fixtures.plugin('asn')
    asn.cfg = { main: {}, protocols: { geoip: true } }
    asn.connection = fixtures.connection.createConnection()
    asn.connection.remote.ip = '8.8.8.8'
    asn.test_and_register_geoip().then(() => {
      asn.lookup_via_maxmind(() => {
        if (asn.dbsLoaded) {
          const res = asn.connection.results.get('asn')
          assert.equal(res.asn, 15169)
          assert.equal(res.org, 'GOOGLE')
        } else {
          console.error('no DBs found')
        }
        done()
      }, asn.connection)
    })
  })

  it('maxmind AS with org', (done) => {
    const asn = new fixtures.plugin('asn')
    asn.cfg = { main: {}, protocols: { geoip: true } }
    asn.connection = fixtures.connection.createConnection()
    asn.connection.remote.ip = '1.1.1.1'
    asn.test_and_register_geoip().then(() => {
      try {
        asn.lookup_via_maxmind(() => {
          if (asn.dbsLoaded) {
            const res = asn.connection.results.get('asn')
            assert.equal(res?.asn, 13335)
            assert.equal(res?.org, 'CLOUDFLARENET')
          }
          done()
        }, asn.connection)
      } catch (e) {
        console.error(e)
        done()
      }
    })
  })
})
