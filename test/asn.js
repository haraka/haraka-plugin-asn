'use strict';

// node build-in modules
const assert     = require('assert');

// npm installed modules
const fixtures   = require('haraka-test-fixtures');

describe('parse_monkey', function () {

  const asn = new fixtures.plugin('asn');

  it('parses AS 15169/23', function (done) {
    assert.deepEqual(
      asn.parse_monkey('74.125.44.0/23 | AS15169 | Google Inc. | 2000-03-30'),
      { net: '74.125.44.0/23', asn: '15169', org: 'Google Inc.',
        date: '2000-03-30', country: undefined
      }
    );
    done();
  });

  it('parses AS 15169/16', function (done) {
    assert.deepEqual(
      asn.parse_monkey('74.125.0.0/16 | AS15169 | Google Inc. | 2000-03-30 | US'),
      { net: '74.125.0.0/16', asn: '15169', org: 'Google Inc.',
        date: '2000-03-30', country: 'US'
      }
    );
    done();
  });
});

describe('parse_routeviews', function () {

  const asn = new fixtures.plugin('asn');

  it('40431 string, asn-only', function (done) {
    assert.deepEqual(
      asn.parse_routeviews('40431'),
      undefined
    );
    done();
  });

  it('40431 string', function (done) {
    assert.deepEqual(
      asn.parse_routeviews('40431 208.75.176.0 21'),
      {
        asn: '40431', net: '208.75.176.0/21'
      }
    );
    done();
  });

  it('15169 CSV string', function (done) {
    assert.deepEqual(
      asn.parse_routeviews('15169,8.8.8.0,24'),
      {asn: '15169', net: '8.8.8.0/24'}
    );
    done();
  });

  it('40431 array', function (done) {
    assert.deepEqual(
      asn.parse_routeviews(['40431','208.75.176.0','21']),
      {asn: '40431', net: '208.75.176.0/21' }
    );
    done();
  });
});

describe('parse_cymru', function () {

  const asn = new fixtures.plugin('asn');

  it('40431', function (done) {
    assert.deepEqual(
      asn.parse_cymru('40431 | 208.75.176.0/21 | US | arin | 2007-03-02'),
      { asn: '40431', net: '208.75.176.0/21', country: 'US',
        assignor: 'arin', date: '2007-03-02'
      }
    );
    done();
  });

  it('10290', function (done) {
    assert.deepEqual(
      asn.parse_cymru('10290 | 12.129.48.0/24 | US | arin |'),
      { asn: '10290', net: '12.129.48.0/24', country: 'US',
        assignor: 'arin', date: ''
      }
    );
    done();
  });
});

describe('parse_rspamd', function () {

  const asn = new fixtures.plugin('asn');

  it('40431', function (done) {
    assert.deepEqual(
      asn.parse_rspamd('15169|8.8.8.0/24|US|arin|'),
      {
        asn: '15169', net: '8.8.8.0/24', country: 'US',
        assignor: 'arin', date: ''
      }
    );
    done();
  });
});

describe('get_dns_results', function () {

  const asn = new fixtures.plugin('asn');
  asn.cfg = { main: { }, protocols: { dns: true } };
  asn.connection = fixtures.connection.createConnection();

  it('origin.asn.cymru.com', function (done) {
    asn.get_dns_results('origin.asn.cymru.com', '8.8.8.8', function (err, zone, obj) {
      if (obj) {
        assert.equal('origin.asn.cymru.com', zone);
        assert.equal('15169', obj.asn);
        assert.equal('8.8.8.0/24', obj.net);
      }
      else {
        assert.equal('something', obj);
      }
      done();
    });
  });

  it('asn.routeviews.org', function (done) {
    asn.get_dns_results('asn.routeviews.org', '8.8.8.8', function (err, zone, obj) {
      if (obj) {
        assert.equal('asn.routeviews.org', zone);
        if (obj.asn && obj.asn === '15169') {
          assert.equal('15169', obj.asn);
        }
      }
      else {
        assert.ok("Node DNS (c-ares) bug");
      }
      done();
    });
  });

  it('asn.rspamd.com', function (done) {
    this.timeout(3000);
    asn.get_dns_results('asn.rspamd.com', '8.8.8.8', function (err, zone, obj) {
      if (obj) {
        assert.equal('asn.rspamd.com', zone);
        assert.equal('15169', obj.asn);
        assert.equal('8.8.8.0/24', obj.net);
      }
      else {
        assert.equal('something', obj);
      }
      done();
    })
  })

  it('origin.asn.spameatingmonkey.net', (done) => {
    this.timeout(3000);
    asn.get_dns_results('origin.asn.spameatingmonkey.net', '8.8.8.8', (err, zone, obj) => {
      if (obj) {
        assert.equal('origin.asn.spameatingmonkey.net', zone);
        assert.equal('15169', obj.asn);
        assert.equal('8.8.8.0/24', obj.net);
      }
      else {
        assert.equal('something', obj);
      }
      done();
    })
  })
})

describe.skip('maxmind geoip db v1', () => {
  /* DEAD: MaxMind no longer publishes updates */
  it('test_and_register_geoip', (done) => {
    const asn = new fixtures.plugin('asn');
    asn.cfg = { main: { }, protocols: { geoip: true } };
    asn.test_and_register_geoip();
    assert.ok(asn.maxmind);
    done();
  })


  it('lookup_via_maxmind, IPv4', (done) => {
    const asn = new fixtures.plugin('asn');
    asn.cfg = { main: { }, protocols: { geoip: true } };
    asn.connection = fixtures.connection.createConnection();
    asn.connection.remote.ip='8.8.8.8';
    asn.test_and_register_geoip();

    asn.lookup_via_maxmind(() => {
      if (asn.mmDbsAvail && asn.mmDbsAvail.length > 0) {
        const res = asn.connection.results.get('asn');
        assert.equal(res.asn, 15169);
        assert.equal(res.org, 'Google LLC');
      }
      else {
        console.error('no DBs found');
      }
      done();
    },
    asn.connection);
  })

  it('lookup_via_maxmind, IPv6', (done) => {
    const asn = new fixtures.plugin('asn');
    asn.cfg = { main: { }, protocols: { geoip: true } };
    asn.connection = fixtures.connection.createConnection();
    asn.connection.remote.ip='2001:4860:4860::8888';
    asn.test_and_register_geoip();

    asn.lookup_via_maxmind(() => {
      console.log(`dbs: ${asn.mmDbsAvail}`)
      if (asn.mmDbsAvail && asn.mmDbsAvail.length > 0) {
        const res = asn.connection.results.get('asn');
        // console.log(res);
        assert.equal(res.asn, 15169);
        assert.equal(res.org, 'Google LLC');
      }
      else {
        console.error('no DBs found');
      }
      done();
    },
    asn.connection);
  });

  it('maxmind AS w/o org', (done) => {
    const asn = new fixtures.plugin('asn');
    asn.cfg = { main: { }, protocols: { geoip: true } };
    asn.connection = fixtures.connection.createConnection();
    asn.connection.remote.ip='216.255.64.1';
    asn.test_and_register_geoip();

    asn.lookup_via_maxmind(() => {
      if (asn.mmDbsAvail && asn.mmDbsAvail.length > 0) {
        const res = asn.connection.results.get('asn');
        // console.log(res);
        assert.equal(res.asn, 63200);
        assert.equal(res.org, '');
      }
      done();
    },
    asn.connection);
  });
});
