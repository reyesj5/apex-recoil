/**
 * Copyright 2021 Mikhail Goncharov
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

var createError = require('http-errors');
var express = require('express');
var path = require('path');
var cookieParser = require('cookie-parser');
var logger = require('morgan');

var app = express();

app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'pug');

app.use(logger('dev'));
app.use(express.json({ limit: '150mb' }));
app.use(express.urlencoded({ extended: true, limit: '150mb' }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));
var fs = require('fs');
var { spawn } = require('child_process');
var specsPath = path.join(__dirname, 'client', 'specs.json');

app.get('/api/specs', function(req, res) {
  fs.readFile(specsPath, 'utf8', function(err, data) {
    if (err) return res.status(500).json({ error: 'Failed to read specs.json' });
    try {
      res.json(JSON.parse(data));
    } catch (e) {
      res.status(500).json({ error: 'Invalid JSON in specs.json' });
    }
  });
});

app.post('/api/specs', function(req, res) {
  var newSpecs = req.body;
  if (!newSpecs) return res.status(400).json({ error: 'No data provided' });

  fs.readFile(specsPath, 'utf8', function(err, data) {
    if (!err && data) {
      fs.writeFile(specsPath + '.bak', data, function() {});
    }

    var specsList;
    try {
      specsList = JSON.parse(data || '[]');
    } catch (e) {
      specsList = [];
    }

    if (Array.isArray(newSpecs)) {
      specsList = newSpecs;
    } else if (newSpecs.weapon) {
      var w = newSpecs.weapon;
      var found = false;
      for (var i = 0; i < specsList.length; i++) {
        if (specsList[i].name === w.name) {
          specsList[i] = Object.assign({}, specsList[i], w);
          found = true;
          break;
        }
      }
      if (!found) specsList.push(w);
    } else {
      return res.status(400).json({ error: 'Expected array of specs or { weapon: ... }' });
    }

    var formatted = JSON.stringify(specsList, null, 4);
    fs.writeFile(specsPath, formatted, 'utf8', function(writeErr) {
      if (writeErr) return res.status(500).json({ error: 'Failed to write specs.json' });
      res.json({ success: true, message: 'specs.json updated successfully', count: specsList.length });
    });
  });
});

app.post('/api/discovery/process-session', function(req, res) {
  var body = req.body || {};
  var weapon = body.weapon;
  var samples = body.samples;
  var rpm = body.rpm;
  var multiplier = body.multiplier || 0.73;

  if (!weapon || !samples || !samples.length) {
    return res.status(400).json({ success: false, error: 'Weapon and at least one sample are required.' });
  }

  var capturesBase = path.join(__dirname, 'processing', 'captures');
  var sessionDir = path.join(capturesBase, 'session_' + Date.now());

  try {
    fs.mkdirSync(sessionDir, { recursive: true });
  } catch (e) {
    return res.status(500).json({ success: false, error: 'Failed to create session dir: ' + e.message });
  }

  for (var i = 0; i < samples.length; i++) {
    var s = samples[i];
    var dataStr = s.data || '';
    var base64Data = dataStr.replace(/^data:video\/[a-zA-Z0-9.-]+;base64,/, '').replace(/^data:application\/octet-stream;base64,/, '');
    var buffer = Buffer.from(base64Data, 'base64');
    var filename = 'spray_' + (i + 1).toString().padStart(2, '0') + '.webm';
    fs.writeFileSync(path.join(sessionDir, filename), buffer);
  }

  var cliArgs = [
    '-m', 'recoil_discovery.cli', 'session',
    '--dir', sessionDir,
    '--weapon', weapon,
    '--multiplier', String(multiplier)
  ];
  if (rpm) {
    cliArgs.push('--rpm', String(rpm));
  }

  var proc = spawn('python', cliArgs, {
    cwd: path.join(__dirname, 'processing')
  });

  var stdoutData = '';
  var stderrData = '';

  proc.stdout.on('data', function(chunk) {
    stdoutData += chunk.toString();
  });

  proc.stderr.on('data', function(chunk) {
    stderrData += chunk.toString();
  });

  proc.on('close', function(code) {
    if (code !== 0) {
      return res.status(500).json({
        success: false,
        error: 'Discovery process exited with code ' + code + ': ' + stderrData
      });
    }

    try {
      var result = JSON.parse(stdoutData.trim());
      res.json(result);
    } catch (parseErr) {
      res.status(500).json({
        success: false,
        error: 'Failed to parse discovery output: ' + stdoutData,
        raw: stdoutData,
        stderr: stderrData
      });
    }
  });
});

app.use('/editor', express.Router().get('/', function(req, res, next) {
  res.render('editor', { title: 'Editor' });
}));
app.use('/ru', express.Router().get('/', function(req, res, next) {
  res.render('index-ru', { title: 'Apex Legends Recoils' });
}));
app.use('/zh-CN', express.Router().get('/', function(req, res, next) {
  res.render('index-zh-CN', { title: 'Apex Legends Recoils' });
}));
app.use('/*',  express.Router().get('/', function(req, res, next) {
  res.render('index', { title: 'Apex Legends Recoils' });
}));

// catch 404 and forward to error handler
app.use(function(req, res, next) {
  next(createError(404));
});

// error handler
app.use(function(err, req, res, next) {
  // set locals, only providing error in development
  res.locals.message = err.message;
  res.locals.error = req.app.get('env') === 'development' ? err : {};

  // render the error page
  res.status(err.status || 500);
  res.render('error');
});

module.exports = app;
