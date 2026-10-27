import { describe, expect, it } from 'vitest';
import { definition as def } from '../../src/lab/definition';
import { SECTIONS } from '../../src/lab/content/sections';

describe('structure list', () => {
  it('lists every mesh structure exactly once (directly or inside its group)', () => {
    const listed = SECTIONS.flatMap((sec) => sec.ids).flatMap((id) => {
      const s = def.structures.find((x) => x.id === id);
      expect(s, id).toBeTruthy();
      return s!.kind === 'group' ? s!.members! : [id];
    });
    expect([...listed].sort()).toEqual(def.structures.filter((s) => s.kind === 'mesh').map((s) => s.id).sort());
  });
});
