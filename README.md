# Bundle client side code with inline dependency declaration syntax

## Synopsis

    # in your source code, declare the files you depend on:
    
    #depend "some_js_file"
    #depend "or_some_coffee_file"
    #depend "even_coco_is_supported"
    #depend "some/path/and_livescript"

    # leave off the top-level function wrapper
    #depend "vendor/Audiolet" bare
    
    # some code using the files here.

In JavaScript, the `//depend` directive is used instead of `#depend`.

Be sure to install the languages you wish to use with `npm install -g`.

## Command line usage

When installed with `npm install jspackage -g`, a command line tool called
`jspackage` will be made available.

```
Usage: jspackage input_file output_file [options]

Available options:
  -h, --help       shows this help section
  -w, --watch      watch source files and recompile when any change
  -l, --lib PATH   add an additional search directory for source files
```

## Features

* File extensions are automatically resolved, and in fact are not allowed in
  depend statements. This goes for the input_file too.
* Files will only be included once in the resulting code, regardless of how
  many times a file is depended upon.
* Compiling CoffeeScript, JavaScript, Coco, LiveScript, and Iced CoffeeScript
  source files are included out of the box.  You can add more to the 
  `compile.extensions` object.
  - Or add support to the bottom of `lib/jspackage.js` and submit a pull
    request.
* Includes a `--watch` mode which automatically recompiles source files when
  they change.
* Ability to supply more source code search paths with `--lib`.
  
## Server example

```coffee
http = require 'http'
{compile} = require 'jspackage'

server = http.createServer (req, res) ->
  res.writeHead(200)
 
  compile {mainfile}, (err, compiled_code) ->
    if err
      res.end 'throw unescape("' + escape(err.toString()) + '");'
    else
      res.end compiled_code
 
server.listen(8080)
```

## Out-of-the-box supported languages

 * JavaScript
 * Coffee-Script
 * LiveScript
 * Coco
 * Iced-Coffee-Script

To add out-of-the-box support for another language, add it to the bottom of
`lib/jspackage.js` and submit a pull request.

To add support by wrapping the code, add an entry to the `extensions`
object:

```coffee
{extensions} = require 'jspackage'
extensions['.lua'] =
  require: 'npm-lua-package'
  compile: (code, options) ->
    require('npm-lua-package').compile(code, bare: options.bare)
  depend_re: /^--depend "(.+)"( bare)?$/gm
```
