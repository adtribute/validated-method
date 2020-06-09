Package.describe({
  name: 'npvn:validated-method',
  summary: "Support using pub-sub-lite's enhanced methods via ValidatedMethod",
  version: '1.2.3',
  documentation: 'README.md',
  git: 'https://github.com/adtribute/validated-method',
});

Package.onUse(function (api) {
  api.versionsFrom('1.7');

  api.use(['ecmascript', 'check', 'ddp', 'npvn:pub-sub-lite']);

  api.mainModule('validated-method.js');
  api.export('ValidatedMethod');
});

Package.onTest(function (api) {
  api.use([
    'ecmascript',
    'practicalmeteor:mocha@2.4.5_6',
    'practicalmeteor:chai@2.1.0_1',
    'aldeed:simple-schema@1.5.4',
    'npvn:validated-method',
    'random',
  ]);

  api.mainModule('validated-method-tests.js');
});
