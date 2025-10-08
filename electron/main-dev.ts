process.env.NODE_ENV = 'development';

import('./main').catch((error) => {
  console.error('[main-dev] failed to bootstrap main process', error);
});
