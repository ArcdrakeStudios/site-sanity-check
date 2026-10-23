// Isolated by tests/performance.test.mjs with a process timeout, so a regression cannot hang the test runner.
import {analyze} from '../src/checks.mjs';
import {redact} from '../src/safety.mjs';
const start=performance.now();
for(const body of ['api_key'+' '.repeat(260000)+'x','[vc_row'.repeat(37000),'[et_pb_x'.repeat(30000)])analyze({body,url:new URL('https://example.com/'),headers:{'content-type':'text/html'},status:200,chain:[]});
redact('password'+' '.repeat(260000)+'x');
console.log(JSON.stringify({elapsedMs:performance.now()-start}));
