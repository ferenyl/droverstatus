import { homedir } from 'node:os';
import { join } from 'node:path';

const home = homedir();

export const config = {
  root: process.env.DROVER_ROOT ?? join(home, '.claude', 'drover'),
  droverSh:
    process.env.DROVER_SH ??
    join(home, 'projects/oss/claudeskills/plugins/ferenyl-claude/skills/drover/scripts/drover.sh'),
  zellijBin: process.env.ZELLIJ_BIN ?? 'zellij',
  port: Number(process.env.PORT ?? 4177),
  host: '127.0.0.1',
};
