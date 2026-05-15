const assert = require('node:assert/strict')
const { beforeEach, describe, it } = require('node:test')

const fixtures = require('haraka-test-fixtures')

describe('maxmind geoip db', () => {
  let plugin
  beforeEach(async () => {
    plugin = new fixtures.plugin('asn')
    plugin.cfg = {
      main: {},
      protocols: { dns: true },
      header: { asn: true, provider: true },
    }
    plugin.cfg.protocols.geoip = true
    await plugin.test_and_register_geoip()
  })

  it('loads maxmind module', () => {
    assert.ok(plugin.maxmind)
  })

  it('lookup_via_maxmind skips when asn already set', async () => {
    if (!plugin.dbsLoaded) return // no DB on this host, skip
    const connection = fixtures.connection.createConnection()
    connection.remote.ip = '8.8.8.8'
    connection.results.add(plugin, { asn: '99999' })
    await new Promise((resolve) => plugin.lookup_via_maxmind(resolve, connection))
    assert.equal(connection.results.get(plugin).asn, '99999')
  })

  it('lookup_via_maxmind IPv4 8.8.8.8 → AS15169 GOOGLE', async () => {
    if (!plugin.dbsLoaded) {
      console.error('no GeoIP DB found, skipping')
      return
    }
    const connection = fixtures.connection.createConnection()
    connection.remote.ip = '8.8.8.8'
    await new Promise((resolve) => plugin.lookup_via_maxmind(resolve, connection))
    const res = connection.results.get(plugin)
    assert.equal(res.asn, 15169)
    assert.equal(res.org, 'GOOGLE')
  })

  it('lookup_via_maxmind IPv4 1.1.1.1 → AS13335 CLOUDFLARENET', async () => {
    if (!plugin.dbsLoaded) {
      console.error('no GeoIP DB found, skipping')
      return
    }
    const connection = fixtures.connection.createConnection()
    connection.remote.ip = '1.1.1.1'
    await new Promise((resolve) => plugin.lookup_via_maxmind(resolve, connection))
    const res = connection.results.get(plugin)
    assert.equal(res.asn, 13335)
    assert.equal(res.org, 'CLOUDFLARENET')
  })
})
