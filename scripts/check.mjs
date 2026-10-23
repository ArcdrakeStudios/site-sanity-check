import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {readdir} from 'node:fs/promises';
import {copy} from '../public/i18n.mjs';
import assert from 'node:assert/strict';
for(const dir of ['src','public','scripts','tests','.'])for(const file of await readdir(new URL(`../${dir}/`,import.meta.url))){if(!file.endsWith('.mjs'))continue;const result=spawnSync(process.execPath,['--check',fileURLToPath(new URL(`../${dir}/${file}`,import.meta.url))],{encoding:'utf8'});if(result.status!==0)throw Error(result.stderr);}
const keys=o=>Object.keys(o).sort();assert.deepEqual(keys(copy.en),keys(copy.de));assert.deepEqual(keys(copy.en.notes),keys(copy.de.notes));assert.deepEqual(keys(copy.en.findings),keys(copy.de.findings));console.log('Syntax and EN/DE key parity passed.');
