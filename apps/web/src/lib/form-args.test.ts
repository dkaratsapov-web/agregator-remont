import { describe, expect, it } from 'vitest';
import { argBool, argInt, argString, encodeFormArgs, readFormArgs } from './form-args';

const form = (args?: string) => {
  const data = new FormData();
  if (args !== undefined) data.set('args', args);
  return data;
};

describe('form args', () => {
  it('round-trips strings, numbers and booleans', () => {
    const args = readFormArgs(form(encodeFormArgs(['job1', 3, true, '/account/jobs/job1'])));
    expect(args).toEqual(['job1', 3, true, '/account/jobs/job1']);
    expect([argString(args[0]), argInt(args[1]), argBool(args[2])]).toEqual(['job1', 3, true]);
  });

  it('anything else gives no args, and typed readers refuse wrong types', () => {
    expect(readFormArgs(form())).toEqual([]);
    expect(readFormArgs(form('not json'))).toEqual([]);
    expect(readFormArgs(form('{"a":1}'))).toEqual([]);
    expect(readFormArgs(form('[{"a":1}]'))).toEqual([]);
    expect(readFormArgs(form('[null]'))).toEqual([]);
    expect(readFormArgs(form(JSON.stringify(Array(9).fill('x'))))).toEqual([]);
    expect(readFormArgs(form(JSON.stringify(['x'.repeat(3000)])))).toEqual([]);
    expect(argString(5)).toBe('');
    expect(argInt('5')).toBeNaN();
    expect(argInt(1.5)).toBeNaN();
    expect(argBool('true')).toBe(false);
  });
});
