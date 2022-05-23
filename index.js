// determine the ASN of the connecting IP

// node built-ins
const dns     = require('dns');
const fs      = require('fs');
const net     = require('net');

// npm modules
const async     = require('async');

let test_ip   = '66.128.51.163';
const providers = [];
let conf_providers = [ 'origin.asn.cymru.com', 'asn.routeviews.org', 'asn.rspamd.com' ];

exports.register = function () {
  this.registered = false;

  this.load_asn_ini();
  this.test_and_register_dns_providers();
  this.test_and_register_geoip();

  if (this.cfg.header.asn) {
    this.register_hook('data_post', 'add_header_asn');
  }
  if (this.cfg.header.provider) {
    this.register_hook('data_post', 'add_header_provider');
  }
}

exports.test_and_register_dns_providers = function () {
  const plugin = this;
  if (!plugin.cfg.protocols.dns) return; // disabled in config

  for (let i=0; i < conf_providers.length; i++) {
    plugin.get_dns_results(conf_providers[i], test_ip, function (err, zone, res) {
      if (err) {
        plugin.logerror(plugin, err);
        return;
      }
      if (!res) {
        plugin.logerror(plugin, `${zone} failed`);
        return;
      }

      plugin.loginfo(plugin, `${zone} succeeded`);
      if (providers.indexOf(zone) === -1) providers.push(zone);

      if (plugin.registered) return;
      plugin.registered = true;
      plugin.register_hook('lookup_rdns', 'lookup_via_dns');
    });
  }
}

exports.load_asn_ini = function () {
  const plugin = this;
  plugin.cfg = plugin.config.get('asn.ini', {
    booleans: [
      '+header.asn',
      '-header.provider',
      '+protocols.dns',
      '+protocols.geoip',
    ]
  },
  function () {
    plugin.load_asn_ini();
  });

  const c = plugin.cfg;
  if (c.main.providers !== undefined) {  // defined
    if (c.main.providers === '') {   // and not empty
      conf_providers = [];
    }
    else {
      conf_providers = c.main.providers.split(/[\s,;]+/);
    }
  }

  if (c.main.test_ip) test_ip = c.main.test_ip;

  // backwards compat with old config settings (Sunset 3.0)
  if (c.main.asn_header !== undefined) c.header.asn = c.main.asn_header;
  if (c.main.provider_header !== undefined) c.header.provider = c.main.provider_header;
}

exports.get_dns_results = function (zone, ip, done) {
  const plugin = this;
  const query = `${ip.split('.').reverse().join('.')}.${zone}`;
  // plugin.logdebug(plugin, "query: " + query);

  // only run the callback once
  let calledDone = false;
  function doneOnce () {
    if (calledDone) return;
    calledDone = true;
    return done.apply(plugin, arguments);
  }

  const timer = setTimeout(() => {
    return doneOnce(new Error(`${zone} timeout`), zone, null);
  }, (plugin.cfg.main.timeout || 4) * 1000);

  dns.resolveTxt(query, function (err, addrs) {
    clearTimeout(timer);
    if (calledDone) return;
    if (err) {
      plugin.logerror(plugin, `error: ${err} running: ${query}`);
      return doneOnce(err, zone);
    }

    if (!addrs || !addrs[0]) {
      return doneOnce(new Error(`no results for ${query}`), zone);
    }

    const first = addrs[0];

    plugin.logdebug(plugin, `${zone} answers: ${first}`);
    const result = plugin.get_result(zone, first);

    return doneOnce(null, zone, result);
  })
}

exports.get_result = function (zone, first) {

  switch (zone) {
    case 'origin.asn.cymru.com'           : return this.parse_cymru(first.join(''));
    case 'asn.routeviews.org'             : return this.parse_routeviews(first);
    case 'asn.rspamd.com'                 : return this.parse_rspamd(first.join(''));
    case 'origin.asn.spameatingmonkey.net': return this.parse_monkey(first.join(''));
  }

  this.logerror(this, `unrecognized ASN provider: ${zone}`);
  return;
}

exports.lookup_via_dns = function (next, connection) {
  const plugin = this;
  if (connection.remote.is_private) return next();

  async.each(providers, (zone, done) => {

    connection.logdebug(plugin, `zone: ${zone}`);

    plugin.get_dns_results(zone, connection.remote.ip, (err, zone2, r) => {
      if (err) {
        connection.logerror(plugin, err.message);
        return done();
      }
      if (!r) return done();

      const results = { emit: true };

      // store asn & net from any source
      if (r.asn) results.asn = r.asn;
      if (r.net) results.net = r.net;

      // store provider specific results
      switch (zone) {
        case 'origin.asn.cymru.com':
          results.cymru = r;
          break;
        case 'asn.routeviews.org':
          results.routeviews = r;
          break;
        case 'origin.asn.spameatingmonkey.net':
          results.monkey = r;
          break;
        case 'asn.rspamd.com':
          results.rspamd = r;
          break;
      }

      connection.results.add(plugin, results);

      return done();
    })
  },
  (err) => {
    if (err) connection.results.add(plugin, { err });
    next();
  })
}

exports.parse_routeviews = function (thing) {
  let labels;

  if (typeof thing === 'string' && /,/.test(thing)) {
    labels = thing.split(',');
    return { asn: labels[0], net: `${labels[1]}/${labels[2]}` };
  }

  // this is a correct result (node >= 0.10.26)
  // 99.177.75.208.asn.routeviews.org. IN TXT "40431" "208.75.176.0" "21"
  if (Array.isArray(thing)) {
    labels = thing;
  }
  else {
    // this is what node (< 0.10.26) returns
    // 99.177.75.208.asn.routeviews.org. IN TXT "40431208.75.176.021"
    labels = thing.split(/ /);
  }

  if (labels.length !== 3) {
    this.logerror(this, `result length not 3: ${labels.length} string="${thing}"`);
    return;
  }

  return { asn: labels[0], net: `${labels[1]}/${labels[2]}` };
}

exports.parse_cymru = function (str) {
  const r = str.split(/\s+\|\s*/);
  //  99.177.75.208.origin.asn.cymru.com. 14350 IN TXT
  //        "40431 | 208.75.176.0/21 | US | arin | 2007-03-02"
  //        "10290 | 12.129.48.0/24  | US | arin |"
  if (r.length < 4) {
    this.logerror(this, `cymru: bad result length ${r.length} string="${str}"`);
    return;
  }
  return { asn: r[0], net: r[1], country: r[2], assignor: r[3], date: r[4] };
}

exports.parse_monkey = function (str) {
  const plugin = this;
  const r = str.split(/\s+\|\s+/);
  // "74.125.44.0/23 | AS15169 | Google Inc. | 2000-03-30"
  // "74.125.0.0/16 | AS15169 | Google Inc. | 2000-03-30 | US"
  if (r.length < 3) {
    plugin.logerror(plugin, `monkey: bad result length ${r.length} string="${str}"`);
    return;
  }
  return {
    asn: r[1].substring(2),
    net: r[0],
    org: r[2],
    date: r[3],
    country: r[4]
  };
}

exports.parse_rspamd = function (str) {
  const plugin = this;
  const r = str.split(/\s*\|\s*/);
  //  8.8.8.8.asn.rspamd.com. 14350 IN TXT
  //        "15169|8.8.8.0/24|US|arin|"

  if (r.length < 4) {
    plugin.logerror(plugin, `rspamd: bad result length ${r.length} string="${str}"`);
    return;
  }
  return { asn: r[0], net: r[1], country: r[2], assignor: r[3], date: r[4] };
}

exports.add_header_asn = function (next, connection) {

  const asn = connection.results.get('asn');
  if (!asn || !asn.asn) return next();

  if (!connection.transaction) return next();

  if (asn.net) {
    connection.transaction.add_header('X-Haraka-ASN', `${asn.asn} ${asn.net}`);
  }
  else {
    connection.transaction.add_header('X-Haraka-ASN', asn.asn);
  }
  if (asn.asn_org) {
    connection.transaction.add_header('X-Haraka-ASN-Org', asn.asn_org);
  }

  next();
}

exports.add_header_provider = function (next, connection) {

  const asn = connection.results.get('asn');
  if (!asn || !asn.asn) return next();

  for (const p in asn) {
    if (!asn[p].asn) continue;  // ignore non-object results

    const name = `X-Haraka-ASN-${p.toUpperCase()}`;
    const values = [];
    for (const k in asn[p]) {
      values.push(`${k}=${asn[p][k]}`);
    }
    if (values.length === 0) return;
    connection.transaction.add_header(name, values.join(' '));
  }

  return next();
}

exports.test_and_register_geoip = function () {
  const plugin = this;
  if (!plugin.cfg.protocols.geoip) return; // disabled in config

  try {
    plugin.maxmind = require('maxmind');
  }
  catch (e) {
    plugin.logerror(e);
    plugin.logerror("unable to load maxmind, try\n\n\t'npm install -g maxmind@0.6'\n\n");
    return;
  }

  const dbs = ['GeoIPASNum', 'GeoIPASNumv6'];
  plugin.mmDbsAvail = [];

  const dbdir = plugin.cfg.main.dbdir || '/usr/local/share/GeoIP/';
  for (let i=0; i < dbs.length; i++) {
    const path = `${dbdir + dbs[i]}.dat`;
    if (!fs.existsSync(path)) continue;
    plugin.mmDbsAvail.push(path);
  }

  plugin.maxmind.dbsLoaded = plugin.mmDbsAvail.length;
  if (plugin.mmDbsAvail.length === 0) {
    plugin.logerror('maxmind loaded but no GeoIP DBs found!');
    return;
  }

  plugin.loginfo(`provider maxmind with ${plugin.mmDbsAvail.length} DBs`);
  plugin.maxmind.init(plugin.mmDbsAvail, {indexCache: true, checkForUpdates: true});
  plugin.register_hook('connect', 'lookup_via_maxmind');
}

exports.lookup_via_maxmind = function (next, connection) {
  const plugin = this;

  if (!plugin.maxmind) return next();
  if (!plugin.maxmind.dbsLoaded) return next();

  let getAsn = 'getAsn';
  if (net.isIPv6(connection.remote.ip)) getAsn = 'getAsnV6';

  const asn = plugin.maxmind[getAsn](connection.remote.ip);
  if (!asn) return next();

  const match = asn.match(/^(?:AS)([0-9]+)(?:\s+)?(.*)?$/);
  if (!match) {
    connection.logerror(plugin, `unexpected AS format: ${asn}`);
    return next();
  }

  connection.results.add(plugin, { asn: match[1], org: match[2] || '' });
  return next();
}
