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
app.use('/captures', express.static(path.join(__dirname, 'processing', 'captures')));
var os = require('os');
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

function isValidWeaponSpec(w) {
  return w && typeof w.name === 'string' && w.name.trim().length > 0 &&
    Array.isArray(w.x) && Array.isArray(w.y) && Array.isArray(w.time_points) &&
    w.x.length === w.y.length && w.x.length === w.time_points.length;
}

app.post('/api/specs', function(req, res) {
  var newSpecs = req.body;
  if (!newSpecs) return res.status(400).json({ error: 'No data provided' });

  fs.readFile(specsPath, 'utf8', function(err, data) {
    if (err) return res.status(500).json({ error: 'Failed to read specs.json: ' + err.message });
    if (data) {
      fs.writeFile(specsPath + '.bak', data, function(bakErr) {
        if (bakErr) console.warn('Warning: Failed to create specs.json.bak:', bakErr.message);
      });
    }

    var specsList;
    try {
      specsList = JSON.parse(data || '[]');
    } catch (e) {
      return res.status(500).json({ error: 'Malformed JSON in specs.json' });
    }

    if (Array.isArray(newSpecs)) {
      for (var sIdx = 0; sIdx < newSpecs.length; sIdx++) {
        if (!isValidWeaponSpec(newSpecs[sIdx])) {
          return res.status(400).json({ error: 'Invalid spec schema at index ' + sIdx });
        }
      }
      specsList = newSpecs;
    } else if (newSpecs.weapon) {
      var w = newSpecs.weapon;
      if (!isValidWeaponSpec(w)) {
        return res.status(400).json({ error: 'Invalid weapon spec schema' });
      }
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

app.post('/api/discovery/process-session', async function(req, res) {
  var body = req.body || {};
  var rawWeapon = body.weapon;
  var samples = body.samples;
  var rpm = body.rpm;
  var shots = body.shots;
  var zoom = body.zoom || 1.0;
  var fov = body.fov || 104.0;
  var distance = body.distance || 20.0;
  var multiplier = body.multiplier || 0.73;

  if (!rawWeapon || !samples || !samples.length) {
    return res.status(400).json({ success: false, error: 'Weapon and at least one sample are required.' });
  }

  var weaponTag = String(rawWeapon).replace(/[^a-zA-Z0-9_-]/g, '');
  if (!weaponTag) {
    return res.status(400).json({ success: false, error: 'Invalid weapon name.' });
  }

  var saveCapture = body.save_capture !== false;
  var modeTag = (body.mode || 'auto').replace(/[^a-zA-Z0-9_-]/g, '');
  var capturesBase = path.join(__dirname, 'processing', 'captures');
  var sessionDir = saveCapture
    ? path.join(capturesBase, 'session_' + weaponTag + '_' + modeTag + '_' + Date.now())
    : fs.mkdtempSync(path.join(os.tmpdir(), 'apex_session_'));

  try {
    fs.mkdirSync(sessionDir, { recursive: true });
  } catch (e) {
    return res.status(500).json({ success: false, error: 'Failed to create session dir: ' + e.message });
  }

  try {
    await Promise.all(samples.map(async function(s, i) {
      var dataStr = s.data || '';
      var base64Data = dataStr.replace(/^data:video\/[a-zA-Z0-9.-]+;base64,/, '').replace(/^data:application\/octet-stream;base64,/, '');
      var buffer = Buffer.from(base64Data, 'base64');
      var filename = 'spray_' + (i + 1).toString().padStart(2, '0') + '.webm';
      await fs.promises.writeFile(path.join(sessionDir, filename), buffer);

      if (s.screenshot) {
        var shotData = s.screenshot.replace(/^data:image\/[a-zA-Z0-9.-]+;base64,/, '');
        var shotBuffer = Buffer.from(shotData, 'base64');
        var shotFilename = 'spray_' + (i + 1).toString().padStart(2, '0') + '_wall.jpg';
        await fs.promises.writeFile(path.join(sessionDir, shotFilename), shotBuffer);
      }
    }));
  } catch (writeErr) {
    return res.status(500).json({ success: false, error: 'Failed to write session samples: ' + writeErr.message });
  }

  var validHdr = ['auto', 'natural', 'vibrant', 'off', 'hdr-standard', 'hdr-vibrant'];
  var hdrParam = body.hdr || body.hdr_mode || 'auto';
  var cleanHdr = validHdr.includes(hdrParam) ? hdrParam : 'auto';

  var validStrategies = ['accumulate', 'overwrite'];
  var strategyParam = body.strategy || 'accumulate';
  var cleanStrategy = validStrategies.includes(strategyParam) ? strategyParam : 'accumulate';

  var cliArgs = [
    '-m', 'recoil_discovery.cli', 'session',
    '--dir', sessionDir,
    '--weapon', weaponTag,
    '--multiplier', String(multiplier)
  ];
  if (rpm && Number(rpm) > 0) {
    cliArgs.push('--rpm', String(Number(rpm)));
  }
  if (shots && Number(shots) > 0) {
    cliArgs.push('--shots', String(Number(shots)));
  }
  if (zoom && Number(zoom) !== 1.0) {
    cliArgs.push('--zoom', String(Number(zoom)));
  }
  if (fov && Number(fov) > 0) {
    cliArgs.push('--fov', String(Number(fov)));
  }
  if (distance && Number(distance) > 0) {
    cliArgs.push('--distance', String(Number(distance)));
  }
  cliArgs.push('--hdr', cleanHdr);
  cliArgs.push('--strategy', cleanStrategy);
  if (body.existing_samples && Number(body.existing_samples) > 0) {
    cliArgs.push('--existing-samples', String(Number(body.existing_samples)));
  }

  var proc = spawn('python', cliArgs, {
    cwd: path.join(__dirname, 'processing')
  });

  proc.on('error', function(err) {
    if (!saveCapture) {
      try { fs.rmSync(sessionDir, { recursive: true, force: true }); } catch (e) {}
    }
    if (!res.headersSent) {
      res.status(500).json({
        success: false,
        error: 'Failed to start Python discovery process: ' + err.message
      });
    }
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
    if (!saveCapture) {
      try { fs.rmSync(sessionDir, { recursive: true, force: true }); } catch (e) {}
    }
    if (res.headersSent) return;

    if (code !== 0) {
      var errDetail = stderrData;
      if (stdoutData) {
        try {
          var parsed = JSON.parse(stdoutData.trim());
          if (parsed && parsed.error) {
            errDetail = parsed.error + (stderrData ? '\n' + stderrData : '');
          }
        } catch (_) {
          if (!errDetail) errDetail = stdoutData;
        }
      }
      return res.status(500).json({
        success: false,
        error: 'Discovery process exited with code ' + code + (errDetail ? ': ' + errDetail : '')
      });
    }

    try {
      var raw = stdoutData.trim();
      var jsonMatch = raw.match(/\{[\s\S]*\}$/);
      var jsonStr = jsonMatch ? jsonMatch[0] : raw;
      var result = JSON.parse(jsonStr);
      result.saved_to_disk = saveCapture;
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

app.get('/api/discovery/sessions', function(req, res) {
  var capturesBase = path.join(__dirname, 'processing', 'captures');
  try {
    if (!fs.existsSync(capturesBase)) {
      return res.json({ success: true, sessions: [] });
    }
    var entries = fs.readdirSync(capturesBase, { withFileTypes: true });
    var sessions = [];
    for (var i = 0; i < entries.length; i++) {
      var ent = entries[i];
      if (ent.isDirectory() && ent.name.startsWith('session_')) {
        var dirPath = path.join(capturesBase, ent.name);
        var parts = ent.name.split('_');
        var timestamp = parseInt(parts[parts.length - 1], 10) || 0;
        var mode = parts[parts.length - 2] || 'auto';
        var weapon = parts.slice(1, -2).join('_') || 'unknown';
        var dirFiles = fs.readdirSync(dirPath);

        var videoFiles = dirFiles.filter(function(f) {
          var ext = path.extname(f).toLowerCase();
          return ext === '.webm' || ext === '.mp4';
        }).sort();

        var samples = [];
        for (var v = 0; v < videoFiles.length; v++) {
          var vFile = videoFiles[v];
          var base = path.parse(vFile).name;
          var companion = dirFiles.find(function(f) {
            return f.startsWith(base) && (f.endsWith('_wall.jpg') || f.endsWith('_wall.png') || f.endsWith('.jpg') || f.endsWith('.png'));
          });
          samples.push({
            video: vFile,
            videoUrl: '/captures/' + ent.name + '/' + vFile,
            screenshot: companion || null,
            screenshotUrl: companion ? ('/captures/' + ent.name + '/' + companion) : null
          });
        }

        var stat = fs.statSync(dirPath);
        var dateObj = timestamp ? new Date(timestamp) : stat.mtime;
        var dateFormatted = dateObj.toLocaleDateString() + ' ' + dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

        sessions.push({
          id: ent.name,
          weapon: weapon,
          mode: mode,
          timestamp: timestamp || stat.mtimeMs,
          date: dateFormatted,
          samplesCount: samples.length,
          samples: samples,
          label: weapon.toUpperCase() + ' (' + mode.toUpperCase() + ') • ' + samples.length + ' spray(s) • ' + dateFormatted
        });
      }
    }
    sessions.sort(function(a, b) { return b.timestamp - a.timestamp; });
    res.json({ success: true, sessions: sessions });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to list sessions: ' + err.message });
  }
});

app.get('/api/discovery/screenshots', function(req, res) {
  var screenshotsDir = path.join(__dirname, 'processing', 'captures', 'screenshots');
  var capturesDir = path.join(__dirname, 'processing', 'captures');
  try {
    var screenshots = [];
    if (fs.existsSync(screenshotsDir)) {
      var files = fs.readdirSync(screenshotsDir);
      for (var i = 0; i < files.length; i++) {
        var f = files[i];
        var ext = path.extname(f).toLowerCase();
        if (ext === '.jpg' || ext === '.jpeg' || ext === '.png') {
          var filePath = path.join(screenshotsDir, f);
          var stat = fs.statSync(filePath);
          screenshots.push({
            filename: f,
            url: '/captures/screenshots/' + f,
            timestamp: stat.mtimeMs,
            date: stat.mtime.toLocaleDateString() + ' ' + stat.mtime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            sizeBytes: stat.size,
            source: 'library'
          });
        }
      }
    }

    // Also include companion wall screenshots found in session directories
    if (fs.existsSync(capturesDir)) {
      var entries = fs.readdirSync(capturesDir, { withFileTypes: true });
      for (var j = 0; j < entries.length; j++) {
        var ent = entries[j];
        if (ent.isDirectory() && ent.name.startsWith('session_')) {
          var sPath = path.join(capturesDir, ent.name);
          var sFiles = fs.readdirSync(sPath);
          for (var k = 0; k < sFiles.length; k++) {
            var sf = sFiles[k];
            var sfExt = path.extname(sf).toLowerCase();
            if ((sfExt === '.jpg' || sfExt === '.jpeg' || sfExt === '.png') && (sf.includes('wall') || sf.startsWith('spray_'))) {
              var sfPath = path.join(sPath, sf);
              var sfStat = fs.statSync(sfPath);
              screenshots.push({
                filename: ent.name + '/' + sf,
                url: '/captures/' + ent.name + '/' + sf,
                timestamp: sfStat.mtimeMs,
                date: sfStat.mtime.toLocaleDateString() + ' ' + sfStat.mtime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                sizeBytes: sfStat.size,
                source: ent.name
              });
            }
          }
        }
      }
    }

    screenshots.sort(function(a, b) { return b.timestamp - a.timestamp; });
    res.json({ success: true, screenshots: screenshots });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to list screenshots: ' + err.message });
  }
});

app.post('/api/discovery/process-static-image', async function(req, res) {
  var body = req.body || {};
  var rawWeapon = body.weapon;
  var images = body.images;
  var singleImage = body.image_data;
  var shots = body.shots;
  var rpm = body.rpm;
  var zoom = body.zoom || 1.0;
  var fov = body.fov || 104.0;
  var distance = body.distance || 20.0;
  var multiplier = body.multiplier || 0.73;
  var saveCapture = body.save_capture === true;

  if (!rawWeapon || (!images && !singleImage)) {
    return res.status(400).json({ success: false, error: 'Weapon and image data are required.' });
  }

  var weaponTag = String(rawWeapon).replace(/[^a-zA-Z0-9_-]/g, '');
  if (!weaponTag) {
    return res.status(400).json({ success: false, error: 'Invalid weapon name.' });
  }

  var imageList = images && images.length ? images : [{ name: 'spray_01_wall.jpg', data: singleImage }];
  var screenshotsDir = path.join(__dirname, 'processing', 'captures', 'screenshots');
  var modeTag = (body.mode || 'auto').replace(/[^a-zA-Z0-9_-]/g, '');

  var targetDir;
  if (saveCapture) {
    targetDir = imageList.length > 1
      ? path.join(__dirname, 'processing', 'captures', 'session_' + weaponTag + '_' + modeTag + '_' + Date.now())
      : screenshotsDir;
    try { fs.mkdirSync(targetDir, { recursive: true }); } catch (e) {}
  } else {
    targetDir = fs.mkdtempSync(path.join(os.tmpdir(), 'apex_shots_'));
  }

  try {
    await Promise.all(imageList.map(async function(item, i) {
      var rawData = (item.data || '').replace(/^data:image\/[a-zA-Z0-9.-]+;base64,/, '');
      var baseName = (item.name || ('spray_' + (i + 1).toString().padStart(2, '0') + '_wall.jpg')).replace(/[^a-zA-Z0-9_.-]/g, '_');
      if (!baseName.toLowerCase().endsWith('.jpg') && !baseName.toLowerCase().endsWith('.png')) {
        baseName += '.jpg';
      }
      if (saveCapture && imageList.length === 1 && targetDir === screenshotsDir && !baseName.includes(weaponTag)) {
        baseName = weaponTag + '_' + modeTag + '_' + Date.now() + '_' + baseName;
      }
      var filePath = path.join(targetDir, baseName);
      await fs.promises.writeFile(filePath, Buffer.from(rawData, 'base64'));
    }));
  } catch (writeErr) {
    return res.status(500).json({ success: false, error: 'Failed to write static images: ' + writeErr.message });
  }

  var validHdr = ['auto', 'natural', 'vibrant', 'off', 'hdr-standard', 'hdr-vibrant'];
  var hdrParam = body.hdr || body.hdr_mode || 'auto';
  var cleanHdr = validHdr.includes(hdrParam) ? hdrParam : 'auto';

  var validStrategies = ['accumulate', 'overwrite'];
  var strategyParam = body.strategy || 'accumulate';
  var cleanStrategy = validStrategies.includes(strategyParam) ? strategyParam : 'accumulate';

  var cliArgs = [
    '-m', 'recoil_discovery.cli', 'session',
    '--dir', targetDir,
    '--weapon', weaponTag,
    '--multiplier', String(multiplier)
  ];
  if (rpm && Number(rpm) > 0) cliArgs.push('--rpm', String(Number(rpm)));
  if (shots && Number(shots) > 0) cliArgs.push('--shots', String(Number(shots)));
  if (zoom && Number(zoom) !== 1.0) cliArgs.push('--zoom', String(Number(zoom)));
  if (fov && Number(fov) > 0) cliArgs.push('--fov', String(Number(fov)));
  if (distance && Number(distance) > 0) cliArgs.push('--distance', String(Number(distance)));
  cliArgs.push('--hdr', cleanHdr);
  cliArgs.push('--strategy', cleanStrategy);
  if (body.existing_samples && Number(body.existing_samples) > 0) {
    cliArgs.push('--existing-samples', String(Number(body.existing_samples)));
  }

  var proc = spawn('python', cliArgs, { cwd: path.join(__dirname, 'processing') });

  proc.on('error', function(err) {
    if (!saveCapture) {
      try { fs.rmSync(targetDir, { recursive: true, force: true }); } catch (e) {}
    }
    if (!res.headersSent) {
      res.status(500).json({ success: false, error: 'Failed to start Python analysis process: ' + err.message });
    }
  });

  var stdoutData = '';
  var stderrData = '';

  proc.stdout.on('data', function(c) { stdoutData += c.toString(); });
  proc.stderr.on('data', function(c) { stderrData += c.toString(); });

  proc.on('close', function(code) {
    if (!saveCapture) {
      try { fs.rmSync(targetDir, { recursive: true, force: true }); } catch (e) {}
    }
    if (res.headersSent) return;

    if (code !== 0) {
      var errDetail = stderrData;
      if (stdoutData) {
        try {
          var parsed = JSON.parse(stdoutData.trim());
          if (parsed && parsed.error) {
            errDetail = parsed.error + (stderrData ? '\n' + stderrData : '');
          }
        } catch (_) {
          if (!errDetail) errDetail = stdoutData;
        }
      }
      return res.status(500).json({ success: false, error: 'Analysis failed (code ' + code + ')' + (errDetail ? ': ' + errDetail : '') });
    }
    try {
      var raw = stdoutData.trim();
      var jsonMatch = raw.match(/\{[\s\S]*\}$/);
      var result = JSON.parse(jsonMatch ? jsonMatch[0] : raw);
      result.saved_to_disk = saveCapture;
      res.json(result);
    } catch (parseErr) {
      res.status(500).json({ success: false, error: 'Failed to parse discovery output: ' + stdoutData, stderr: stderrData });
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
