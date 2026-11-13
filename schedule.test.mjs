import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validDate,weekDates,manilaDate} from './schedule.mjs';
test('schedule dates use the Philippine day across the UTC midnight boundary',()=>{assert.equal(manilaDate(new Date('2026-11-13T17:00:00Z')),'2026-11-14');assert.equal(manilaDate(new Date('2026-11-13T15:00:00Z')),'2026-11-13');});
test('schedule rejects impossible dates and builds a Monday-to-Sunday week',()=>{assert.equal(validDate('2026-02-30'),false);assert.equal(validDate('2026-11-14'),true);assert.equal(validDate('yesterday'),false);assert.deepEqual(weekDates('2026-11-14'),['2026-11-09','2026-11-10','2026-11-11','2026-11-12','2026-11-13','2026-11-14','2026-11-15']);});
