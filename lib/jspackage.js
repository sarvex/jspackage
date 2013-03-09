var fs = require('fs')
  , path = require('path')
  , async = require('async')
  , watchFilesOnce = require('./watch').watchFilesOnce
  , cached_files = {}
  , watching = null
  , libs = null
  , root = null

exports.compile = compile;
exports.extensions = {
  '.coffee': {
    require: 'coffee-script',
    compile: function(code, options){
      return require('coffee-script').compile(code, {
        bare: options.bare
      });
    },
    depend_re: /^#depend "(.+)"( bare)?$/gm
  },
  '.js': {
    require: null,
    compile: function(code, options){
      if (options.bare) {
        return code;
      } else {
        return "(function(){\n" + code + "}).call(this);";
      }
    },
    depend_re: /^\/\/depend "(.+)"( bare)?;?$/gm
  },
  '.co': {
    require: 'coco',
    compile: function(code, options){
      return require('coco').compile(code, {
        bare: options.bare
      });
    },
    depend_re: /^#depend "(.+)"( bare)?$/gm
  },
  '.ls': {
    require: 'LiveScript',
    compile: function(code, options){
      return require('LiveScript').compile(code, {
        bare: options.bare
      });
    },
    depend_re: /^#depend "(.+)"( bare)?$/gm
  },
  '.iced': {
    require: 'iced-coffee-script',
    compile: function(code, options){
      return require('iced-coffee-script').compile(code, {
        bare: options.bare
      });
    },
    depend_re: /^#depend "(.+)"( bare)?$/gm
  }
};
function compile(options, cb){
  var ref$, res$, i$, len$, lib, dep;
  watching = options.watch;
  libs = (ref$ = options.libs) != null ? ref$ : [];
  res$ = [];
  for (i$ = 0, len$ = libs.length; i$ < len$; ++i$) {
    lib = libs[i$];
    res$.push(path.resolve(lib));
  }
  libs = res$;
  libs.unshift(".");
  root = null;
  dep = {
    depend: options.mainfile,
    options: {
      bare: options.bare
    },
    cwd: process.cwd(),
    seen: []
  };
  collectDependencies(dep, function(collect_err){
    if (collect_err && root == null) {
      cb(collect_err);
      return;
    }
    resolveDependencyChain(root, function(err, dependency_chain){
      var dep, closer, output;
      if (watching) {
        closer = watchFilesOnce((function(){
          var i$, ref$, len$, results$ = [];
          for (i$ = 0, len$ = (ref$ = dependency_chain).length; i$ < len$; ++i$) {
            dep = ref$[i$];
            results$.push(dep.path);
          }
          return results$;
        }()), function(){
          compile(options, cb);
        });
      }
      if (err) {
        cb(err);
      } else if (collect_err) {
        cb(collect_err);
      } else {
        output = (function(){
          var i$, ref$, len$, results$ = [];
          for (i$ = 0, len$ = (ref$ = dependency_chain).length; i$ < len$; ++i$) {
            dep = ref$[i$];
            results$.push(dep.compiled_js);
          }
          return results$;
        }()).join("\n");
        cb(null, output, closer);
      }
    });
  });
}
function of$(x, arr){
  var i = 0, l = arr.length >>> 0;
  while (i < l) if (x === arr[i++]) return true;
  return false;
}
function parseFile(resolved_dep, cb){
  var file = {
    path: resolved_dep.path,
    compiled_js: null,
    mtime: null,
    deps: [],
    cwd: path.dirname(resolved_dep.path)
  };
  fs.stat(resolved_dep.path, function(err, stat){
    if (err) {
      cb(err);
      return;
    }
    file.mtime = +stat.mtime;
    fs.readFile(resolved_dep.path, 'utf8', function(err, source){
      var parser, timestamp, re, result;
      if (err) {
        cb(err);
        return;
      }
      if (source.charCodeAt(0) === 65279) {
        source = source.substring(1);
      }
      parser = exports.extensions[path.extname(resolved_dep.path)];
      try {
        file.compiled_js = parser.compile(source, resolved_dep.options);
      } catch (e$) {
        err = e$;
        cb(resolved_dep.path + "\n" + err, file);
        return;
      }
      if (watching) {
        timestamp = new Date().toLocaleTimeString();
        console.info(timestamp + " - compiled " + file.path);
      }
      re = parser.depend_re;
      re.lastIndex = 0;
      while (result = re.exec(source)) {
        file.deps.push({
          depend: result[1],
          options: {
            bare: result[2] != null
          },
          cwd: file.cwd,
          seen: resolved_dep.seen.concat(file.path)
        });
      }
      cb(null, file);
    });
  });
}
function resolveDepend(dep, doneResolvingDepend){
  var try_exts = Object.keys(exports.extensions);
  var lib_index = 0;
  tryNextLib();
  function tryNextLib() {
    var try_lib, resolveWithExt;
    if ((try_lib = libs[lib_index++]) != null) {
      resolveWithExt = function(ext, cb){
        var resolved_path = path.resolve(dep.cwd, try_lib, dep.depend + ext);
        fs.realpath(resolved_path, function(err, real_path){
          if (err) {
            cb(null, null);
            return;
          }
          fs.stat(real_path, function(err, stat){
            if (err || stat.isDirectory()) {
              cb(null, null);
            } else {
              cb(null, real_path);
            }
          });
        });
      };
      async.map(try_exts, resolveWithExt, function(err, results){
        async.filter(results, function(item, cb){
          return cb(item != null);
        }, function(results){
          if (results.length === 1) {
            doneResolvingDepend(null, {
              path: results[0],
              options: dep.options,
              seen: dep.seen
            });
          } else if (results.length === 0) {
            tryNextLib();
          } else if (results.length > 1) {
            doneResolvingDepend(new Error("ambiguous dependency: " + dep.depend));
          }
        });
      });
    } else {
      doneResolvingDepend(new Error("unable to resolve dependency: " + dep.depend));
    }
  }
}
function resolveDependencyChain(root, doneResolvingDependencyChain){
  var files, seen, processNode;
  files = [];
  seen = {};
  processNode = function(node, doneProcessingNode){
    async.map(node.deps, resolveDepend, function(err, resolved_deps){
      var funcs, i$, len$, dep, file;
      if (err) {
        doneProcessingNode(err);
        return;
      }
      funcs = [];
      for (i$ = 0, len$ = resolved_deps.length; i$ < len$; ++i$) {
        dep = resolved_deps[i$];
        file = cached_files[dep.path];
        if (seen[file.path] != null) {
          continue;
        }
        seen[file.path] = true;
        funcs.push(async.apply(processNode, file));
      }
      async.parallel(funcs, function(err, results){
        files.push(node);
        if (err) {
          doneProcessingNode(err);
          return;
        }
        doneProcessingNode(null);
      });
    });
  };
  processNode(root, function(err){
    doneResolvingDependencyChain(err, files);
  });
}
function collectDependencies(dep, doneCollectingDependencies){
  resolveDepend(dep, function(err, resolved_dep){
    var dep_chain, parseAndHandleErr, callNext, cached_file;
    if (err) {
      doneCollectingDependencies(err);
      return;
    }
    if (of$(resolved_dep.path, dep.seen)) {
      dep_chain = dep.seen.concat(resolved_dep.path).join(" depends on\n");
      doneCollectingDependencies(new Error("circular dependency:\n" + dep_chain));
      return;
    }
    parseAndHandleErr = function(cb){
      parseFile(resolved_dep, function(err, file){
        if (file) {
          cached_files[file.path] = file;
          if (root == null) root = file;
        }
        if (err) {
          doneCollectingDependencies(err);
        } else {
          cb(file);
        }
      });
    };
    callNext = function(file){
      async.map(file.deps, collectDependencies, doneCollectingDependencies);
    };
    if ((cached_file = cached_files[resolved_dep.path]) != null) {
      fs.stat(resolved_dep.path, function(err, stat){
        if (cached_file.mtime === +stat.mtime) {
          if (root == null) root = cached_file;
          callNext(cached_file);
        } else {
          parseAndHandleErr(callNext);
        }
      });
    } else {
      parseAndHandleErr(callNext);
    }
  });
}
