#!/usr/bin/env node
/**
 * mRPC SDK — Unit + Integration Tests
 * 
 * Usage:
 *   node test.js                    — unit tests only (no server)
 *   node test.js http://localhost   — unit + integration tests
 */

const mRPC = require('./mRPC.js');

let PASS = 0, FAIL = 0;
const green = (s) => console.log(`  \x1b[32m✅ ${s}\x1b[0m`) || PASS++;
const red   = (s) => console.log(`  \x1b[31m❌ ${s}\x1b[0m`) || FAIL++;

function check(name, condition) {
    condition ? green(name) : red(name);
}

// ══════════════════════════════════════════════════
// Unit Tests (no server needed)
// ══════════════════════════════════════════════════
console.log('\n══ Unit Tests ══');

// Constructor
const api = new mRPC('http://localhost:8088');
check('constructor: endpoint set', api.endpoint === 'http://localhost:8088');
check('constructor: token null by default', api.token === null);
check('constructor: timeout default 30s', api.timeout === 30000);
check('constructor: version set', api.version === 'mRPC/1.0');

// Constructor with options
const api2 = new mRPC('http://example.com', { token: 'abc', timeout: 5000 });
check('constructor: token from options', api2.token === 'abc');
check('constructor: timeout from options', api2.timeout === 5000);

// setToken
const api3 = new mRPC('http://example.com');
const ret = api3.setToken('xyz');
check('setToken: sets token', api3.token === 'xyz');
check('setToken: returns this (chainable)', ret === api3);

// onError callback
let errorCaught = null;
const api4 = new mRPC('http://0.0.0.0:1', { onError: (err) => { errorCaught = err; } });

// Network error handling
(async () => {
    const res = await api4.call('test');
    check('network error: ok=false', res.ok === false);
    check('network error: code=network', res.error.code === 'network');
    check('network error: has message', typeof res.error.message === 'string');
    check('network error: cmd preserved', res.cmd === 'test');
    check('network error: v set', res.v === 'mRPC/1.0');
    check('network error: onError called', errorCaught !== null);
    check('network error: onError code', errorCaught?.code === 'network');

    // help() calls cmd=help
    // describe() passes command param
    // ping() calls cmd=ping
    // These are just wrappers, verified by checking they exist
    check('help() is function', typeof api.help === 'function');
    check('describe() is function', typeof api.describe === 'function');
    check('ping() is function', typeof api.ping === 'function');
    check('login() is function', typeof api.login === 'function');
    check('setToken() is function', typeof api.setToken === 'function');

    // Module exports
    check('module.exports is mRPC', require('./mRPC.js') === mRPC);

    console.log('');

    // ══════════════════════════════════════════════════
    // Integration Tests (needs running server)
    // ══════════════════════════════════════════════════
    const endpoint = process.argv[2];
    if (endpoint) {
        console.log(`══ Integration Tests (${endpoint}) ══`);
        const live = new mRPC(endpoint);

        // ping
        const pong = await live.ping();
        check('ping: ok=true', pong.ok === true);
        check('ping: cmd=ping', pong.cmd === 'ping');
        check('ping: has v', pong.v?.startsWith('mRPC/'));
        check('ping: has ms', typeof pong.ms === 'number');
        check('ping: has data', typeof pong.data === 'object');

        // help
        const help = await live.help();
        check('help: ok=true', help.ok === true);
        check('help: has commands', typeof help.data?.commands === 'object');
        check('help: has total', typeof help.data?.total === 'number');
        check('help: total > 0', help.data?.total > 0);

        // unknown command
        const unk = await live.call('nonexistent_xyz_123');
        check('unknown: ok=false', unk.ok === false);
        check('unknown: error.code=unknown_cmd', unk.error?.code === 'unknown_cmd');

        // auth token
        const authed = new mRPC(endpoint, { token: 'test-token' });
        const authRes = await authed.call('ping');
        check('auth: token sent without crash', authRes.ok === true);

        console.log('');
    } else {
        console.log('══ Skipping integration tests (no endpoint) ══\n');
    }

    // Results
    console.log('══════════════════════════════════════════════════');
    const total = PASS + FAIL;
    const pct = Math.round(PASS * 100 / total);
    console.log(`🧪 mRPC SDK: ${PASS}/${total} passed (${pct}%)`);
    console.log(FAIL === 0 ? '   ✅ ALL PASSED' : `   ❌ ${FAIL} FAILURES`);
    console.log('══════════════════════════════════════════════════\n');

    process.exit(FAIL === 0 ? 0 : 1);
})();
