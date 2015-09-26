var watchifyMiddleware = require('../')
var test = require('tape')
var http = require('http')
var semver = require('semver')
var browserify = require('browserify')
var path = require('path')
var request = require('got')
var fs = require('fs')
var vm = require('vm')

test('gets version', function(t) {
  t.ok(semver.valid(watchifyMiddleware.getWatchifyVersion()), 'gets watchify version')
  t.end()
})

test('serves bundle', function(t) {
  t.plan(6)
  var staticUrl = 'bundle.js'
  var bundler = browserify(path.resolve(__dirname, 'fixture.js'), {
    cache: {}, 
    packageCache: {},
    basedir: __dirname 
  })
  bundler.bundle(function (err, expected) {
    if (err) return t.fail(err)
    var pending = true
    var emitter = watchifyMiddleware.emitter(bundler)
    var middleware = emitter.middleware
    var server = http.createServer(function (req, res) {
      if (req.url === '/' + staticUrl) {
        middleware(req, res)
      }
    })
    
    emitter.on('pending', function () {
      pending = false
      t.ok(true, 'gets pending event')
    })
    
    emitter.on('update', function (src, deps) {
      t.equal(pending, false, 'pending gets called before update')
      t.equal(Array.isArray(deps), true, 'gets an array of changed deps')
      t.equal(deps.length, 0, 'first bundle has zero changed deps')
      t.equal(src.toString(), expected.toString(), 'update sends bundle source')
    })

    server.listen(8000, 'localhost', function () {
      request('http://localhost:8000/' + staticUrl, function (err, bundled) {
        server.close()
        emitter.close()
        if (err) return t.fail(err)
        t.equal(bundled.toString(), expected.toString(), 'bundles match')
      })
    })
  })
})

test('serves with error handler', function(t) {
  t.plan(2)
  var bundler = browserify(path.resolve(__dirname, 'fixture-err.js'), {
    cache: {}, 
    packageCache: {},
    basedir: __dirname 
  })
  var emitter = watchifyMiddleware.emitter(bundler, {
    errorHandler: function (err) {
      t.ok(err.message.indexOf('ParseError') >= 0, 'errorHandler gets err')
      return ''
    }
  })
  
  emitter.on('error', function () {
    t.fail(new Error('should not emit error when errorHandler passed'))
  })
  
  emitter.on('bundle-error', function (err) {
    t.ok(err.message.indexOf('ParseError') >= 0, 'bundle-error gets called')
    emitter.close()
  })
})

test('serves without error handler', function(t) {
  t.plan(2)
  var bundler = browserify(path.resolve(__dirname, 'fixture-err.js'), {
    cache: {}, 
    packageCache: {},
    basedir: __dirname 
  })
  var emitter = watchifyMiddleware.emitter(bundler)
  
  emitter.on('error', function (err) {
    t.ok(err.message.indexOf('ParseError') >= 0, 'error gets called')
    emitter.close()
  })
  
  emitter.on('bundle-error', function () {
    t.ok(true, 'bundle-error also gets called')
    emitter.close()
  })
})

test('does watchify stuff correctly', function(t) {
  t.plan(3)
  
  var fixture = path.resolve(__dirname, 'fixture-watch.js')
  var bundler = browserify(fixture, {
    cache: {}, 
    packageCache: {},
    basedir: __dirname 
  })
  var emitter = watchifyMiddleware.emitter(bundler)
  var middleware = emitter.middleware
  var staticUrl = 'bundle.js'
  var uri = 'http://localhost:8000/' + staticUrl
  
  var server = http.createServer(function (req, res) {
    if (req.url === '/' + staticUrl) {
      middleware(req, res)
    }
  })
  
  // start as "foo"
  // then write "bar"
  fs.writeFile(fixture, 'console.log("foo")', function (err) {
    if (err) return t.fail(err)
    server.listen(8000, 'localhost', startTest)
  })
  
  function startTest() {
    runRequest(logFoo, function () {
      emitter.once('pending', function () {
        // file save event
        fs.writeFile(fixture, 'console.log("bar")', function (err) {
          if (err) return t.fail(err)
          runRequest(logBar, function () {
            server.close()
            emitter.close()
          })
        })
      })
      emitter.once('update', function (src) {
        vm.runInNewContext(src, { console: { log: logBar } });
      })
      
    })
  }
  
  function runRequest (logFn, cb) {
    request(uri, function (err, src) {
      if (err) return t.fail(err)
      vm.runInNewContext(src, { console: { log: logFn } });
      cb()
    })
  }
  
  function logFoo (msg) {
    t.equal(msg, 'foo')
  }
  
  function logBar (msg) {
    t.equal(msg, 'bar')
  }
})