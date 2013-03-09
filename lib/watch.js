var chokidar = require('chokidar');

exports.watchFilesOnce = function(files, cb) {
  var watcher = chokidar.watch(files, {ignored: /^\./, persistent: true});
  watcher.on('change', function() {
    cb();
    watcher.close();
  });
  return watcher;
};
