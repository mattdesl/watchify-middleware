var createWatchify = require('watchify')
var EventEmitter = require('events').EventEmitter
var debounce = require('debounce')
var concat = require('concat-stream')
var assign = require('object-assign')
var parseError = require('./parse-error')

module.exports = bundler
function bundler (browserify, opt) {
  opt = opt || {}
  var emitter = new EventEmitter()
  var delay = opt.delay || 0
  var closed = false
  var pending = true
  var time = Date.now()
  var updates = []
  var errorHandler = opt.errorHandler
  if (errorHandler === true) {
    errorHandler = defaultErrorHandler
  }

  var watchify = createWatchify(browserify, assign({}, opt, {
    // we use our own debounce, so make sure watchify
    // ignores theirs
    delay: 0
  }))
  var contents = null

  emitter.close = function () {
    if (closed) {
      return
    }
    closed = true
    if (watchify) {
      // needed for watchify@3.0.0
      // this needs to be revisited upstream
      setTimeout(function () {
        watchify.close()
      }, 50)
    }
  }

  var bundleDebounced = debounce(bundle, delay)
  watchify.on('update', function (rows) {
    updates = rows
    emitter.emit('pending')
    pending = true
    time = Date.now()
    bundleDebounced()
  })

  // initial bundle
  time = Date.now()
  emitter.emit('pending')
  pending = true
  bundle()

  function bundle () {
    if (closed) {
      update()
      return
    }

    var didError = false

    var outStream = concat(function (body) {
      if (!didError) {
        contents = body

        var delay = Date.now() - time
        emitter.emit('log', {
          elapsed: Math.round(delay),
          level: 'info',
          type: 'bundle'
        })

        bundleEnd()
      }
    })

    var wb = watchify.bundle()
    // it can be nice to handle errors gracefully
    if (typeof errorHandler === 'function') {
      wb.once('error', function (err) {
        err.message = parseError(err)
        contents = errorHandler(err) || ''

        didError = true
        bundleEnd()
      })
    }
    wb.pipe(outStream)

    function bundleEnd () {
      update()
    }
  }
  return emitter

  function update () {
    if (pending) {
      pending = false
      emitter.emit('update', contents, updates)
      updates = []
    }
  }
}

function defaultErrorHandler (err) {
  console.error('%s', err)
  return ';console.error(' + JSON.stringify(err.message) + ');'
}
