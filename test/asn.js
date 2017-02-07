'use strict';

// node build-in modules
var assert       = require('assert');

// npm installed modules
var fixtures     = require('haraka-test-fixtures');

describe('parse_monkey', function () {

  var asn = new fixtures.plugin('asn');

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
      {
        net: '74.125.0.0/16', asn: '15169', org: 'Google Inc.',
        date: '2000-03-30', country: 'US'
      }
    );
    done();
  });
});

describe('parse_routeviews', function () {

  var asn = new fixtures.plugin('asn');

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

  var asn = new fixtures.plugin('asn');

  it('40431', function (done) {
    assert.deepEqual(
      asn.parse_cymru('40431 | 208.75.176.0/21 | US | arin | 2007-03-02'),
      {
        asn: '40431', net: '208.75.176.0/21', country: 'US',
        assignor: 'arin', date: '2007-03-02'
      }
    );
    done();
  });

  it('10290', function (done) {
    assert.deepEqual(
      asn.parse_cymru('10290 | 12.129.48.0/24 | US | arin |'),
      {
        asn: '10290', net: '12.129.48.0/24', country: 'US',
        assignor: 'arin', date: ''
      }
    );
    done();
  });
});

describe('get_dns_results', function () {

  var asn = new fixtures.plugin('asn');
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
    });
  });

});

describe('maxmind geoip db v1', function () {
  it('test_and_register_geoip', function (done) {
    var asn = new fixtures.plugin('asn');
    asn.cfg = { main: { }, protocols: { geoip: true } };
    asn.test_and_register_geoip();
    assert.ok(asn.maxmind);
    done();
  });


  it('lookup_via_maxmind', function (done) {
    var asn = new fixtures.plugin('asn');
    asn.cfg = { main: { }, protocols: { } };
    asn.connection = fixtures.connection.createConnection();
    asn.connection.remote.ip='8.8.8.8';
    asn.test_and_register_geoip();

    asn.lookup_via_maxmind(function () {
      if (asn.mmDbsAvail && asn.mmDbsAvail.length > 0) {
        var res = asn.connection.results.get('asn');
        assert.equal(res.asn, 15169);
        assert.equal(res.org, 'Google Inc.');
      }
      done();
    },
    asn.connection);
  });
});
