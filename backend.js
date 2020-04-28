const express = require('express');
const bodyParser = require('body-parser');
global.path = require('path');
const cors = require('cors');
const parseRange = require('range-parser');
const torrentStream = require('torrent-stream');
const fs = require('fs');
const electron = require('electron');
const ProgressBar = require('electron-progressbar');
const request = require('request');
global.yifysubtitles = require('yifysubtitles');

// analytics
var firebase = require("firebase/app");
require("firebase/database");
var firebaseConfig = {
    apiKey: "AIzaSyCXX0VC1lX7UlLs2qAjhUy7ZM3YyJrwP7M",
    authDomain: "magnet-f7299.firebaseapp.com",
    databaseURL: "https://magnet-f7299.firebaseio.com",
    projectId: "magnet-f7299",
    storageBucket: "magnet-f7299.appspot.com",
    messagingSenderId: "263213102480",
    appId: "1:263213102480:web:56e58ecf3d6664ea5cef15",
    measurementId: "G-3PV14LT24B"
};
firebase.initializeApp(firebaseConfig);
var database = firebase.database();

const VERSION = "1.0.0";
const PORT = 3000;
var window;


electron.dialog.showErrorBox = function(title, content) {
    console.log("ERROR DEFAULTED!!!!");
    console.log(`${title}\n${content}`);
};

var app = express();
app.use(bodyParser.urlencoded({ extended: true }))
app.use(bodyParser.json())

if (!fs.existsSync(getAppDataPath())) {
    fs.mkdirSync(getAppDataPath());
    fs.mkdirSync(path.join(getAppDataPath(), "subtitles"));
} else {
     fs.rmdir(path.join(getAppDataPath(), "streams"), { 
      recursive: true, 
        }, (error) => { 
          if (error) { 
            console.log(error); 
          } else { 
            console.log("Wiped Streams"); 
          }
        });    
    if (!fs.existsSync(path.join(getAppDataPath(), 'subtitles'))) {
        fs.mkdirSync(path.join(getAppDataPath(), "subtitles"));
    } else {
        fs.rmdir(path.join(getAppDataPath(), "subtitles"), { 
          recursive: true, 
            }, (error) => { 
              if (error) { 
                console.log(error); 
              } else { 
                console.log("Wiped Subtitles"); 
                fs.mkdirSync(path.join(getAppDataPath(), "subtitles"));
              }
            });
    }
}

var recsNeedUpdate = true;

var db;
var mylist_db;
var history_db;
var history_ids;
var isRetrieving = false;
electron.app.disableHardwareAcceleration()
electron.app.on("ready", function() {
    request('http://magnet.socifyinc.com/stable/version.json', function(error, response, body) {
        if (error) { console.log("error retrieving version.json"); start(); } else {
            console.log("no error");
            var app_version_json = JSON.parse(body);
            var app_version_string = app_version_json["version"];
            var is_mandatory = app_version_json["mandatory"];
            console.log("Latest App Version: " + app_version_string);
            if (app_version_string != VERSION && is_mandatory == "true") {
                // mandatory update
                const options = {
                    type: 'warning',
                    buttons: ['OK'],
                    defaultId: 2,
                    title: 'Mandatory Update',
                    message: 'There is a mandatory update to Magnet.',
                    detail: 'Go to http://magnet.socifyinc.com to download the latest version!'                
                  };

              electron.dialog.showMessageBox(null, options).then(result => {
                    console.log("mandatory update; exiting.");
                  electron.app.exit();
              });
            } else if (app_version_string != VERSION) {
                // update, but not required
                const options = {
                    type: 'info',
                    buttons: ['OK'],
                    defaultId: 2,
                    title: 'Optional Update',
                    message: 'There is a new (optional) update to Magnet!',
                    detail: 'Go to http://magnet.socifyinc.com to download the latest version!'                
                  };

              electron.dialog.showMessageBox(null, options).then(result => {
                 console.log("non-mandatory update;");
                  start();
              });
            } else {
                // latest version
                console.log("no update");
                start();
            }
        }
    });
});

function start() {    
    request('http://magnet.socifyinc.com/stable/db_version.json', function (error, response, body) {      
      var version_json = JSON.parse(body);
      var version_string = version_json["version"];
        version_string = "1.0.2";
      console.log("Latest DB Version: " + version_string);
      
      if (fs.existsSync(path.join(getAppDataPath(), 'db.json'))) {
        fs.readFile(path.join(getAppDataPath(), 'db.json'), 'utf8', function (err, data) {
          if (err) throw err;
          temp_db = JSON.parse(data);
          if (temp_db["version"] == version_string) {
            // no need to update  
            console.log("[Startup] Local DB is same version as Remote DB");
            db = temp_db["db"];  
            var keys = Object.keys(db);
            console.log("Found " + keys.length + " keys");
            if (fs.existsSync(path.join(getAppDataPath(), 'history_db.json'))) {
          console.log("Magnet Has Already Been Run: " + getAppDataPath());
          fs.readFile(path.join(getAppDataPath(), 'history_db.json'), 'utf8', function (err, data) {
              if (err) throw err;
              history_db = JSON.parse(data);
              history_ids = Object.keys(history_db);
  
              // For You
              //console.log("[ForYou] First Time");            
              fs.readFile(path.join(getAppDataPath(), 'mylist_db.json'), 'utf8', function (list_err, list_data) {
                  if (list_err) throw list_err;
                  mylist_db = JSON.parse(list_data);
  
                  for (var list_id of Object.keys(mylist_db)) {
                    history_ids.push(list_id)
                  }
                  console.log("Found history ID's: " + history_ids);
               
                  var recs = getRecs("", 1);
            
                  // Sort recommendations by similarity and remove input movies
                  var sortedObj = {}
                  Object.keys(recs).map(key => ({ key: key, value: recs[key] })).sort((first, second) => (first.value.similarity < second.value.similarity) ? -1 : (first.value.similarity > second.value.similarity) ? 1 : 0 ).reverse().forEach((sortedData) => sortedObj[sortedData.value.imdb_code] = sortedData.value);
                  var limitedObj = {}
                  var keys = Object.keys(sortedObj);      
                  for (movie_id of history_ids) {
                    delete sortedObj[movie_id];
                  }
                  for (var i = 0; i < 96; i++) {
                    limitedObj[keys[i]] = sortedObj[keys[i]]
                  }
                  recsNeedUpdate = false;
                  recsObj = limitedObj;
            
                  //console.log("[Trending] First Time");
                  var sortedObjTwo = {};
                  var limitedObjTwo = {};
                  Object.keys(db).map(key => ({ key: key, value: db[key] })).sort((first, second) => (first.value.rating < second.value.rating) ? -1 : (first.value.rating > second.value.rating) ? 1 : 0 ).reverse().forEach((sortedData) => sortedObjTwo[sortedData.value.imdb_code] = sortedData.value);
                  var keys = Object.keys(sortedObjTwo);
                  var i = 0;
                  var added = 0;
                  while (added < 96) {
                    if (db[keys[i]]["year"] > 2017) {
                      limitedObjTwo[keys[i]] = db[keys[i]];
                      added++;
                    }   
                    i++;   
                  }
                  trendingObj = limitedObjTwo;
  
                  app.listen(PORT, function() {
                      console.log("[Backend] Launched on port " + PORT);
                      // Server Launched, Open Window                      
                      createWindow();
                  });
              });
          });
            } else {
                console.log("First Time Running");
                var obj = {};
                history_db = obj;
                history_ids = Object.keys(obj);
                mylist_db = obj;
                fs.writeFileSync(path.join(getAppDataPath(), 'history_db.json'), JSON.stringify(obj));
                fs.writeFileSync(path.join(getAppDataPath(), 'mylist_db.json'), JSON.stringify(obj));
                app.listen(PORT, function() {
                    console.log("[Backend] Launched on port " + PORT);
                    // Server Launched, Open Window
                    createWindow();
                });
            }        
          } else {
            // we need to update
            var progressBar = new ProgressBar({
                indeterminate: false,
                text: 'Hold on...',
                detail: "We're getting the latest movies for you...",
                    browserWindow: {              
                    webPreferences: {
                        nodeIntegration: true
                    }
                },
                style: {
                  value: {
                    'background-color':  '#cebc8b'
                  }
                }
              });  

                progressBar.on('completed', function() {
                        console.info(`completed...`);			
                    })
                    .on('aborted', function(value) {
                        console.info(`aborted... ${value}`);
                    })
                    .on('progress', function(value) {
                  console.log(value, progressBar.getOptions().maxValue)			
                });
              
            console.log("[Startup] Local DB is outdated. New Version: " + version_string);
            progress(request("http://magnet.socifyinc.com/stable/db.json"), {

            }).on('progress', function (state) {    
              var percent = state.percent * 100;                
              if(!progressBar.isCompleted()){
                progressBar.value = percent;             
                  if (!isRetrieving && percent == 100) { fb_updateDBDownloads(); retrieveData(); }
              }
              //console.log('progress', progressBar.value);
            })
            .on('error', function (err) {
                // Do something with err 
            })
            .on('end', function () { 
              if(!progressBar.isCompleted()){
                progressBar.value = 100;                
                  if (!isRetrieving) { fb_updateDBDownloads();  retrieveData(); }
              }              
            })
            .pipe(fs.createWriteStream(path.join(getAppDataPath(), 'db.json')));   
          }
        });
      } else {
        // we need to update
        var progressBar = new ProgressBar({
            indeterminate: false,
            text: 'Hold on...',
            detail: "We're getting the latest movies for you...",
                browserWindow: {              
                webPreferences: {
                    nodeIntegration: true
                }
            },
            style: {
              value: {
                'background-color':  '#cebc8b'
              }
            }
          });  

            progressBar.on('completed', function() {
                    console.info(`completed...`);			
                })
                .on('aborted', function(value) {
                    console.info(`aborted... ${value}`);
                })
                .on('progress', function(value) {
              console.log(value, progressBar.getOptions().maxValue)			
            });
          
        console.log("[Startup] No Local DB");
        progress(request("http://magnet.socifyinc.com/stable/db.json"), {

        }).on('progress', function (state) {    
          var percent = state.percent * 100;  
          //console.log('progress', percent);
          if(!progressBar.isCompleted()){
            progressBar.value = percent;
              if (!isRetrieving && percent == 100) { fb_updateDBDownloads(); retrieveData(); }
          }
          //console.log('progress', progressBar.value);
        })
        .on('error', function (err) {
            // Do something with err 
        })
        .on('end', function () {     
          if(!progressBar.isCompleted()){
            progressBar.value = 100;
              if (!isRetrieving) { fb_updateDBDownloads(); retrieveData(); }
          }          
        })
        .pipe(fs.createWriteStream(path.join(getAppDataPath(), 'db.json')));   
      }
    }); 
}

function retrieveData() {
    isRetrieving = true
    fs.readFile(path.join(getAppDataPath(), 'db.json'), 'utf8', function (err, data) {
            if (err) throw err;
            var temp_db = JSON.parse(data);
            db = temp_db["db"];
            var keys = Object.keys(db);
            console.log("Found " + keys.length + " keys");
            if (fs.existsSync(path.join(getAppDataPath(), 'history_db.json'))) {
              console.log("Magnet Has Already Been Run: " + getAppDataPath());
              fs.readFile(path.join(getAppDataPath(), 'history_db.json'), 'utf8', function (err, data) {
                  if (err) throw err;
                  history_db = JSON.parse(data);
                  history_ids = Object.keys(history_db);
      
                  // For You
                  //console.log("[ForYou] First Time");            
                  fs.readFile(path.join(getAppDataPath(), 'mylist_db.json'), 'utf8', function (list_err, list_data) {
                      if (list_err) throw list_err;
                      mylist_db = JSON.parse(list_data);
      
                      for (var list_id of Object.keys(mylist_db)) {
                        history_ids.push(list_id)
                      }
                      console.log("Found history ID's: " + history_ids);
                  
                      var recs = getRecs("", 1);
                
                      // Sort recommendations by similarity and remove input movies
                      var sortedObj = {}
                      Object.keys(recs).map(key => ({ key: key, value: recs[key] })).sort((first, second) => (first.value.similarity < second.value.similarity) ? -1 : (first.value.similarity > second.value.similarity) ? 1 : 0 ).reverse().forEach((sortedData) => sortedObj[sortedData.value.imdb_code] = sortedData.value);
                      var limitedObj = {}
                      var keys = Object.keys(sortedObj);      
                      for (movie_id of history_ids) {
                        delete sortedObj[movie_id];
                      }
                      for (var i = 0; i < 96; i++) {
                        limitedObj[keys[i]] = sortedObj[keys[i]]
                      }
                      recsNeedUpdate = false;
                      recsObj = limitedObj;
                
                      //console.log("[Trending] First Time");
                      var sortedObjTwo = {};
                      var limitedObjTwo = {};
                      Object.keys(db).map(key => ({ key: key, value: db[key] })).sort((first, second) => (first.value.rating < second.value.rating) ? -1 : (first.value.rating > second.value.rating) ? 1 : 0 ).reverse().forEach((sortedData) => sortedObjTwo[sortedData.value.imdb_code] = sortedData.value);
                      var keys = Object.keys(sortedObjTwo);
                      var i = 0;
                      var added = 0;
                      while (added < 96) {
                        if (db[keys[i]]["year"] > 2017) {
                          limitedObjTwo[keys[i]] = db[keys[i]];
                          added++;
                        }   
                        i++;   
                      }
                      trendingObj = limitedObjTwo;
      
                      app.listen(PORT, function() {
                          console.log("[Backend] Launched on port " + PORT);
                          // Server Launched, Open Window
                          createWindow();
                      });
                  });
              });
          } else {
              console.log("First Time Running");
              var obj = {};
              history_db = obj;
              history_ids = Object.keys(obj);
              mylist_db = obj;
              fs.writeFileSync(path.join(getAppDataPath(), 'history_db.json'), JSON.stringify(obj));
              fs.writeFileSync(path.join(getAppDataPath(), 'mylist_db.json'), JSON.stringify(obj));
              app.listen(PORT, function() {
                  console.log("[Backend] Launched on port " + PORT);
                  // Server Launched, Open Window
                  createWindow();
              });
          }
        });
}

//
// Electron
//

electron.Menu.setApplicationMenu(false)
electron.app.on('activate', () => {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (electron.BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
});
electron.app.on('window-all-closed', () => {
    // On macOS it is common for applications and their menu bar
    // to stay active until the user quits explicitly with Cmd + Q
    if (process.platform !== 'darwin') {
      electron.app.quit()
    }
})

function getHistoryString(ids, encoded) {
  console.log("getHistoryString");
  if (ids === undefined) {
    console.log("IDs were undefined");
    return "";
  } else {
    var string = "";
    for (var i = 0; i < ids.length; i++) {
        if (i == 0) {
            string += ids[i];
        } else {
            if (encoded) {
                string += "+" + ids[i];
            } else {
                string += " " + ids[i];
            }
        }
    }
    return string;
  }
}

function createWindow() {
    console.log("Loaded URL");
    window = new electron.BrowserWindow({title: "Magnet", width: 1380, height: 900, show: false, backgroundColor: 'black', webPreferences: {nodeIntegration: true, nodeIntegrationInSubFrames: true}});
    electron.app.allowRendererProcessReuse = true;
    window.loadURL('http://localhost:3000/trending');
    
    window.on('ready-to-show', function() {
      window.show();
      window.focus();
  });
    /*window.webContents.on('new-window', (event, url, frameName, disposition, options) => {
      event.preventDefault()
      const win = new electron.BrowserWindow({
        webContents: options.webContents, // use existing webContents if provided
        show: false,
          webPreferences: {
              nodeIntegration: true              
          }
      })
      win.once('ready-to-show', () => win.show())
      if (!options.webContents) {
        win.loadURL(url) // existing webContents will be navigated automatically
      }
      event.newGuest = win
        win.webContents.openDevTools();
    })*/
    
    window.webContents.on("new-window", function(event, url) {
      event.preventDefault();
      electron.shell.openExternal(url);
    });

    //window.webContents.openDevTools();    
}

//
// Express Endpoints
//

app.get('/movie', cors(), function(request, response) {
    var imdb_id = request.query.q;
    var json = db[imdb_id];
    response.set('Content-Type', 'text/html');
    console.log("[MovieDetails] ID: " + imdb_id);
   
    if (Object.keys(mylist_db).includes(imdb_id)) {
      json["on_list"] = "true";
    } else {
      json["on_list"] = "false";
    }
    
    var recs = getRecs(imdb_id, 1);

      // Sort recommendations by similarity and remove input movies      
      var sortedObj = {}
      Object.keys(recs).map(key => ({ key: key, value: recs[key] })).sort((first, second) => (first.value.similarity < second.value.similarity) ? -1 : (first.value.similarity > second.value.similarity) ? 1 : 0 ).reverse().forEach((sortedData) => sortedObj[sortedData.value.imdb_code] = sortedData.value);
      delete sortedObj[imdb_id];      
      var limitedObj = {}
      var keys = Object.keys(sortedObj);
      for (var i = 0; i < 8; i++) {
        limitedObj[keys[i]] = sortedObj[keys[i]]
      }      
      recs = limitedObj;
    
    
    var values = {"json_string": JSON.stringify(json), "watch_id": imdb_id, "add_id": imdb_id, "recs": JSON.stringify(recs), "imdb_id": imdb_id, "timestamp": 0, "duration": 1};
    var html_content = fs.readFileSync(path.join(electron.app.getAppPath(), 'movie.html'), 'utf8');
    if (Object.keys(history_db).includes(imdb_id)) {
        // user has watched, provide timestamp
        console.log("PROVIDING TIMESTAMP: " + history_db[imdb_id]["timestamp"])
        values["timestamp"] = history_db[imdb_id]["timestamp"];
        values["duration"] = history_db[imdb_id]["duration"];
    }
    html_content = mergeValues(values, html_content);

    fb_updateMovieDetails(imdb_id);
    
    response.write(html_content);
    response.end();
});

app.get('/watching', cors(), function(request, response) {
    var watched = JSON.stringify(history_db);

    var values = {"json_string": watched};
    var html_content = fs.readFileSync(path.join(electron.app.getAppPath(),'watched.html'), 'utf8');
    html_content = mergeValues(values, html_content);

    fb_updateWatched();
    response.write(html_content);
    response.end();   
    destroy_engine();
});

app.get('/my_list', cors(), function(request, response) {
    var my_list = JSON.stringify(mylist_db);

    var values = {"json_string": my_list};
    var html_content = fs.readFileSync(path.join(electron.app.getAppPath(),'my_list.html'), 'utf8');
    html_content = mergeValues(values, html_content);

    fb_updateMyList();
    response.write(html_content);
    response.end();
    destroy_engine();
});

app.get('/js/plyr.js', cors(), function(request, response) {
    response.sendFile(path.join(electron.app.getAppPath(), 'js/plyr.js'));    
});

app.get('/js/general.js', cors(), function(request, response) {
    response.sendFile(path.join(electron.app.getAppPath(), 'js/general.js'));   
});

app.get('/css/plyr.css', cors(), function(request, response) {
    response.sendFile(path.join(electron.app.getAppPath(), 'css/plyr.css'));   
});

app.get('/img/logo.png', cors(), function(request, response) {
    response.sendFile(path.join(electron.app.getAppPath(), 'img/logo.png'));    
});

app.get('/css/style.css', cors(), function(request, response) {
    response.sendFile(path.join(electron.app.getAppPath(), 'css/style.css'));    
});

app.get('/completed_movie', cors(), function(request, response) {
    var movie_id = request.query.q;
    var json = db[movie_id];
    history_db[movie_id] = json;
    history_ids = Object.keys(history_db);
    recsNeedUpdate = true;
    fs.writeFile (path.join(getAppDataPath(), 'history_db.json'), JSON.stringify(history_db), function(err) {
        if (err) {
            response.send("Error: " + err.message);
            response.end();
        } else {
            console.log('Updated history DB with movie_id: ' + movie_id);
            response.status(200);
            response.send("Operation Successful");
            response.end();
        }
    });    
});

app.get('/add_to_list', cors(), function(request, response) {
    var movie_id = request.query.q;
    var json = db[movie_id];
    if (Object.keys(mylist_db).includes(movie_id)) {
      // remove from list
      delete mylist_db[movie_id];
      var index = history_ids.indexOf(movie_id);
      if (index !== -1) history_ids.splice(index, 1);
      recsNeedUpdate = true;
      fs.writeFile (path.join(getAppDataPath(), 'mylist_db.json'), JSON.stringify(mylist_db), function(err) {
        if (err) {
            response.send("Error: " + err.message);
            response.end();
        } else {
            response.status(200);
            console.log('Removed from mylist DB with movie_id: ' + movie_id);
            /*var my_list = JSON.stringify(mylist_db);
            var values = {"json_string": my_list};
            var html_content = fs.readFileSync(path.join(electron.app.getAppPath(),'my_list.html'), 'utf8');
            html_content = mergeValues(values, html_content);
            response.write(html_content);*/
            response.end();
        }
    });
    } else {
      mylist_db[movie_id] = json;
      history_ids.push(movie_id);
      recsNeedUpdate = true;
      fs.writeFile (path.join(getAppDataPath(), 'mylist_db.json'), JSON.stringify(mylist_db), function(err) {
          if (err) {
              response.send("Error: " + err.message);
              response.end();
          } else {
              response.status(200);
              console.log('Updated mylist DB with movie_id: ' + movie_id);
              fb_updateAddList(movie_id);
              response.end();
          }
      });
    }
});

app.get('/update_watching', cors(), function(request, response) {
    var movie_id = request.query.id;    
    var timestamp = request.query.timestamp;    
    var duration = request.query.duration; 
    var json = db[movie_id];
    json["timestamp"] = timestamp;
    json["duration"] = duration;
    json["progress"] = parseInt(timestamp) / parseInt(duration);    
    history_db[movie_id] = json;        
    fs.writeFile (path.join(getAppDataPath(), 'history_db.json'), JSON.stringify(history_db), function(err) {
        if (err) {
            response.send("Error: " + err.message);
            response.end();
        } else {
            console.log('Updated history DB with movie_id: ' + movie_id);
            response.status(200);
            response.send("Operation Successful");
            response.end();
        }
    });
    
});

var trendingObj = {};
app.get('/trending', cors(), function(request, response) {
  if (Object.keys(trendingObj) == 0) {
      console.log("[Trending] First Time");
      var sortedObj = {};
      var limitedObj = {};
      Object.keys(db).map(key => ({ key: key, value: db[key] })).sort((first, second) => (first.value.rating < second.value.rating) ? -1 : (first.value.rating > second.value.rating) ? 1 : 0 ).reverse().forEach((sortedData) => sortedObj[sortedData.value.imdb_code] = sortedData.value);
      var keys = Object.keys(sortedObj);
      var i = 0;
      var added = 0;
      while (added < 96) {
        if (db[keys[i]]["year"] > 2017) {
          limitedObj[keys[i]] = db[keys[i]];
          added++;
        }   
        i++;   
      }
      trendingObj = limitedObj;
  } else {
    console.log("[Trending] Already Got It");
  }

    var values = {"json_string": JSON.stringify(trendingObj)};
    var html_content = fs.readFileSync(path.join(electron.app.getAppPath(),'trending.html'), 'utf8');
    html_content = mergeValues(values, html_content);

    fb_updateTrending();
    response.write(html_content);
    response.end();
    destroy_engine();
});

var recsObj = {};
app.get('/movies', cors(), function(request, response) {
  if (recsNeedUpdate) {
      console.log("[ForYou] First Time");
      
      var recs = getRecs("", 1);

      // Sort recommendations by similarity and remove input movies
      var sortedObj = {}
      Object.keys(recs).map(key => ({ key: key, value: recs[key] })).sort((first, second) => (first.value.similarity < second.value.similarity) ? -1 : (first.value.similarity > second.value.similarity) ? 1 : 0 ).reverse().forEach((sortedData) => sortedObj[sortedData.value.imdb_code] = sortedData.value);
      for (movie_id of history_ids) {
        delete sortedObj[movie_id];
      }
      var limitedObj = {}
      var keys = Object.keys(sortedObj);
      for (var i = 0; i < 96; i++) {
        limitedObj[keys[i]] = sortedObj[keys[i]]
      }      
      recsObj = limitedObj;
      recsNeedUpdate = false;
    } else {
      console.log("[ForYou] Already Got It");
    }
    
    response.set('Content-Type', 'text/html');

    var values = {"json_string": JSON.stringify(recsObj)};
    var html_content = fs.readFileSync(path.join(electron.app.getAppPath(), 'movies.html'), 'utf8');
    html_content = mergeValues(values, html_content);

    fb_updateForYou();
    response.write(html_content);
    response.end();
    destroy_engine();

});

app.get('/genre', cors(), function(request, response) {
    var query = request.query.q;
    
    var searchObj = {};
    for (var movie_id in db) {
      var movie = db[movie_id];
      var genres = movie["genres"];
      if (genres.indexOf(query) > -1) {
          searchObj[movie_id] = movie;
      }
    }

    var limitedObj = {}
    var sortedObj = {}
    Object.keys(searchObj).map(key => ({ key: key, value: searchObj[key] })).sort((first, second) => (first.value.rating < second.value.rating) ? -1 : (first.value.rating > second.value.rating) ? 1 : 0 ).reverse().forEach((sortedData) => sortedObj[sortedData.value.imdb_code] = sortedData.value);
    var keys = Object.keys(sortedObj);
    var i = 0;
    var added = 0;
    while (added < 96) {
      if (sortedObj[keys[i]]["year"] > 2015) {
        limitedObj[keys[i]] = sortedObj[keys[i]];
        added++;
      }   
      i++;   
    }

    var genre_json = JSON.stringify(limitedObj);
    var values = {"json_string": genre_json};
    var html_content = fs.readFileSync(path.join(electron.app.getAppPath(),'genres.html'), 'utf8');
    html_content = mergeValues(values, html_content);

    fb_updateGenres(query);
    response.write(html_content);
    response.end();
    destroy_engine();
});

app.get('/search', cors(), function(request, response){
    var query = request.query.q;
    var json = {};
    var i = 0;
    
    for (var movie_id in db){
      var movie = db[movie_id];
      var movie_title = movie["title"];
      // mod means modified
      var mod_title = ((movie_title.replace(/[^0-9a-z]/gi, '')).replace(/\s/g, "")).toLowerCase();
      var mod_query = ((query.replace(/[^0-9a-z]/gi, '')).replace(/\s/g, "")).toLowerCase();
      if (mod_title.includes(mod_query)){
        json[movie_id] = movie;
        i++;
        if (i == 96) {
          break;
        }
      }
    }

    var values = {"json_string": JSON.stringify(json)};
    var html_content = fs.readFileSync(path.join(electron.app.getAppPath(),'search.html'), 'utf8');
    html_content = mergeValues(values, html_content);

    fb_updateSearchQueries(query);
    response.write(html_content);
    response.end();
    destroy_engine();
});

function get_subtitles(movie_id) {
    var subtitlePath = path.join(getAppDataPath(), "subtitles");       
    yifysubtitles(movie_id, {langs: ['en', 'es', 'zh'], path: subtitlePath, format: 'vtt'})
      .then(res => {
        for (sub of res) {
            var abs_path = sub["path"];            
            if (abs_path != '') {
                if (sub["lang"] == 'english') {
                    serve_subtitle_track(abs_path, movie_id, "english");                   
                } else if (sub["lang"] == 'spanish') {
                    serve_subtitle_track(abs_path, movie_id, "spanish");                    
                } else if (sub["lang"] == 'chinese') {
                    serve_subtitle_track(abs_path, movie_id, "chinese");                    
                }
            }
        }                        
      })
      .catch(error => {console.log("ERROR: " + error)});
}

global.serve_subtitle_track = function(localURL, movie_id, language) {
    app.get('/subtitles_' + movie_id + "_" + language, function(request, response) {
        response.sendFile(localURL);
    });    
    return '/subtitles_' + movie_id + "_" + language;
} 

var streamingEndpoint = "";
global.streaming = false;
global.magengine;
global.serve_movie = function(id) {
    console.log("SERVE MOVIE REQUESTED");
    destroy_engine();    
    streamingEndpoint = '/stream_' + id
    app.get('/stream_' + id, function(request, response) {
            const range = request.headers.range;
            response.setHeader('Accept-Ranges', 'bytes');
            var requested_id = id;
            console.log("[Engine] Requested stream of " + requested_id);
            var magnet = db[requested_id]["magnet"];
            console.log("[Engine] Magnet link: " + magnet)
            var magengine = streamTorrent(magnet).then(function(file) {
              response.setHeader('Content-Length', file.length);
              response.setHeader('Content-Type', `video/${file.ext}`);
              if (request.headers.range === undefined) {
                if (request.method !== 'GET') return response.end();
                return file.createReadStream().pipe(response);
              } else {
                const ranges = parseRange(file.length, request.headers.range, { combine: true });
                if (ranges === -1) {
                    // 416 Requested Range Not Satisfiable
                    response.statusCode = 416;
                    return response.end();
                } else if (ranges === -2 || ranges.type !== 'bytes' || ranges.length > 1) {
                    // 200 OK requested range malformed or multiple ranges requested, stream entire video
                    if (request.method !== 'GET') return response.end();
                    return file.createReadStream().pipe(response);
                } else {
                    // 206 Partial Content valid range requested
                    const range = ranges[0];
                    response.statusCode = 206;
                    response.setHeader('Content-Length', 1 + range.end - range.start);
                    response.setHeader('Content-Range', `bytes ${range.start}-${range.end}/${file.length}`);
                    if (request.method !== 'GET') return response.end();
                    return file.createReadStream(range).pipe(response);
                }
              }
            }).catch(function (e) {
              console.error(e);
              response.end(e);
            });
        })
}

//
// Recommender Methods
//

function destroy_engine() {
    if (streaming) {
        magengine.remove(function() {
            console.log("[Engine] Removed Files");
            magengine.destroy(function() {
                console.log("[Engine] Destroyed Engine");
                streaming = false;
            }); 
        });        
    }
}

function isHighRating(rating){
    return rating > 0;
}

function getYearClass(year){
    if (year >= 2000 && year <= 2020) return "year_7"
    else if (year >= 1977 && year <= 1999) return "year_6";
    else if (year >= 1955 && year <= 1976) return "year_5";
    else if (year >= 1941 && year <= 1954) return "year_4";
    else if (year >= 1927 && year <= 1940) return "year_3";
    else if (year >= 1911 & year <= 1926) return "year_2";
    else return "year_1"
}

function getDurationClass(duration){
    if (duration > (2.25 * 60.0)) return "duration_4";
    else if ((duration > 1.75 * 60.0) && (duration <= 2.25 * 60.0)) return "duration_3";
    else if ((duration >= 1.25 * 60.0) && (duration <= 1.75 * 60.0)) return "duration_2";
    else return "duration_1";
}

function modifyUserVector(feature, userVector){
  if (userVector.hasOwnProperty(feature)){
    userVector[feature] += 1;
  } else {
    userVector[feature] = 1;
  }
}

function calcVector(obj){
  var sum = 0;
  for( var el in obj ) {
    if( obj.hasOwnProperty( el ) ) {
      sum += parseFloat( obj[el] );
    }
  }
  for( var el in obj ) {
    if( obj.hasOwnProperty( el ) ) {
      obj[el] = parseFloat( obj[el] )/sum;
    }
  }
  return obj;
}

function getUserProfile(movieList){    
  var featureList = [];
  var userVector = {};
  for (index in movieList){
    var movie_id = movieList[index];
    var movie = db[movie_id];
    // Genres
    var genreList = movie["genres"];
    for (index in genreList){
      var genre = genreList[index];
      modifyUserVector(genre, userVector);
      if (!featureList.includes(genre)) featureList.push(genre);
    }
    // Cast
    var castList = movie["cast"];
    for (index in castList){
      var member = castList[index];
      modifyUserVector(member, userVector);
      if (!featureList.includes(member)) featureList.push(member)
    }
    // Language
    var language = movie["language"];
    modifyUserVector(language, userVector);
    if (!featureList.includes(language)) featureList.push(language);
    // Year
    var year = getYearClass(movie["year"]);
    modifyUserVector(year, userVector);
    if (!featureList.includes(year)) featureList.push(year);
    // Duration
    var duration = getDurationClass(movie["runtime"]);
    modifyUserVector(duration, userVector);
    if(!featureList.includes(duration)) featureList.push(duration);
    // Maturity Rating
    var maturityRating = movie["mpa_rating"];
    modifyUserVector(maturityRating, userVector);
    if(!featureList.includes(maturityRating)) featureList.push(maturityRating);
    // IMDb Rating
    var rating = movie["rating"];
    var ratingFeature = "high_rating"
    if(isHighRating(rating)){
        modifyUserVector(ratingFeature, userVector);
        if(!featureList.includes(ratingFeature)) featureList.push(ratingFeature);
    }
  }
  weightedVector = calcVector(userVector);
  return [weightedVector, featureList];
}

function getMovieData(featureList){
  var movieMatrix = {};
  for (movie_id in db){
    var movieObject = {};
    var movie = db[movie_id];

    // Hit signifies the movie has the feature (used to be 1)
    var scaleFactor = getQualityRating(movie["rating"]);
    var hit = scaleFactor;

    var genreList = movie["genres"];
    var castList = movie["cast"]
    var language = movie["language"];
    var year = getYearClass(movie["year"]);
    var duration = getDurationClass(movie["runtime"]);
    var maturityRating = movie["mpa_rating"];
    // IMDb Rating
    var rating = movie["rating"];
    var ratingFeature = "high_rating";
    
    for (feature_index in featureList){
      var feature = featureList[feature_index];
      if (genreList.includes(feature)){
        movieObject[feature] = hit;
      } else if (castList.includes(feature)){
        movieObject[feature] = hit;
      } else if (feature == language){
        movieObject[feature] = hit;
      } else if (feature == year){
        movieObject[feature] = hit;
      } else if (feature == duration){
        movieObject[feature] = hit;
      } else if (feature == maturityRating){
        movieObject[feature] = hit;
      } else if (feature == ratingFeature){
        if(isHighRating(rating)){
            movieObject[feature] = hit;
        }
      }
    }
    movieMatrix[movie_id] = movieObject;
  }

  return movieMatrix;
}

function dotProduct(userVector, movieObject, featureList){
    var product = 0;

    featureList.forEach(function(feature, index){
      if (movieObject.hasOwnProperty(feature)){
        product += parseFloat(userVector[feature])*parseFloat(movieObject[feature]);
      }
    });
    return product;
  }

//
// Helper Methods
//

const streamTorrent = function(torrent) {
    return new Promise(function (resolve, reject) {
        console.log("[Magengine] Opening Stream ...");        
        magengine = torrentStream(torrent, {tmp: getAppDataPath(), path: path.join(getAppDataPath(), "streams")});
        magengine.on('ready', function() {
            streaming = true;
            console.log("[Magengine] Ready ...");
            magengine.files.forEach(function (file, idx) {
                console.log('[Magengine] Filename:', file.name);
                console.log('[Magengine] File Size:', file.length);
                const ext = path.extname(file.name).slice(1);
                if (ext === 'mkv' || ext === 'mp4') {
                    console.log('[Magengine] Valid File');
                    file.ext = ext;
                    resolve(file);
                }
            });
        });
    });
}

function mergeValues(values, content) {
    for (var key in values) {
        content = content.replace("{{" + key + "}}", values[key]);
    }
    return content;
}

global.getAppDataPath = function() {
    switch (process.platform) {
      case "darwin": {
        return path.join(process.env.HOME, "Library", "Application Support", "Magnet");
      }
      case "win32": {
        return path.join(process.env.APPDATA, "Magnet");
      }
      case "linux": {
        return path.join(process.env.HOME, "Magnet");
      }
      default: {
        console.log("Unsupported platform!");
        process.exit(1);
      }
    }
  }

function getAppDataPath() {
    switch (process.platform) {
      case "darwin": {
        return path.join(process.env.HOME, "Library", "Application Support", "Magnet");
      }
      case "win32": {
        return path.join(process.env.APPDATA, "Magnet");
      }
      case "linux": {
        return path.join(process.env.HOME, "Magnet");
      }
      default: {
        console.log("Unsupported platform!");
        process.exit(1);
      }
    }
  }

function getQualityRating(rating){
  if (rating >= 8) return 1;
  else if (rating >= 6 && rating < 8) return 0.8;
  else if (rating >= 4 && rating < 6) return 0.6;
  else return 0.4;
}

function getRecs(request_string, request_page) {  
  // As of now [initial release], request_page is unused.   
  if (request_string =="") {
      console.log("undefined dewey; passing in history_ids");
      request_string = getHistoryString(history_ids, false);
      if (request_string == "") {
        console.log("undefined dewey x2");
          request_string = "tt5463162 tt1951261 tt7286456";
          console.log("no history found; using placeholder values (Deadpool)");
      }
  }
  console.log("[Rec] Input: " + request_string);
  var movieList = request_string.split(" ");
  var profile = getUserProfile(movieList);
  var userProfile = profile[0];
  var featureList = profile[1];
  var movieData = getMovieData(featureList);

  var recs = {};
  for (movie_id in movieData){
    var movie = movieData[movie_id];
    var similarity = dotProduct(userProfile, movie, featureList);
    recs[movie_id] = db[movie_id];
    recs[movie_id]["similarity"] = similarity;
  }
  return recs;
}

function fb_updateMovieDetails(movie_id) {
    var newPostKey = firebase.database().ref().child('beta_analytics/movie_details').child(movie_id).push().key;
    var updates = {};
    var entry_data = {timestamp: Date.now()};
    updates['beta_analytics/movie_details/' + movie_id + "/"+ newPostKey] = entry_data;
    return firebase.database().ref().update(updates);
}

function fb_updateMovieStream(movie_id) {
    var newPostKey = firebase.database().ref().child('beta_analytics/movie_stream').child(movie_id).push().key;
    var updates = {};
    var entry_data = {timestamp: Date.now()};
    updates['beta_analytics/movie_stream/' + movie_id + "/"+ newPostKey] = entry_data;
    return firebase.database().ref().update(updates);
}

function fb_updateAddList(movie_id) {
    var newPostKey = firebase.database().ref().child('beta_analytics/add_list').child(movie_id).push().key;
    var updates = {};
    var entry_data = {timestamp: Date.now()};
    updates['beta_analytics/add_list/' + movie_id + "/"+ newPostKey] = entry_data;
    return firebase.database().ref().update(updates);
}

function fb_updateTrending() {
    var newPostKey = firebase.database().ref().child('beta_analytics/trending').push().key;
    var updates = {};
    var entry_data = {timestamp: Date.now()};
    updates['beta_analytics/trending/' + newPostKey] = entry_data;
    return firebase.database().ref().update(updates);
}

function fb_updateForYou() {
    var newPostKey = firebase.database().ref().child('beta_analytics/foryou').push().key;
    var updates = {};
    var entry_data = {timestamp: Date.now()};
    updates['beta_analytics/foryou/' + newPostKey] = entry_data;
    return firebase.database().ref().update(updates);
}

function fb_updateWatched() {
    var newPostKey = firebase.database().ref().child('beta_analytics/watched').push().key;
    var updates = {};
    var entry_data = {timestamp: Date.now()};
    updates['beta_analytics/watched/' + newPostKey] = entry_data;
    return firebase.database().ref().update(updates);
}

function fb_updateMyList() {
    var newPostKey = firebase.database().ref().child('beta_analytics/mylist').push().key;
    var updates = {};
    var entry_data = {timestamp: Date.now()};
    updates['beta_analytics/mylist/' + newPostKey] = entry_data;
    return firebase.database().ref().update(updates);
}

function fb_updateGenres(genre) {
    var newPostKey = firebase.database().ref().child('beta_analytics/genres').child(genre).push().key;
    var updates = {};
    var entry_data = {timestamp: Date.now()};
    updates['beta_analytics/genres/' + genre + "/"+ newPostKey] = entry_data;
    return firebase.database().ref().update(updates);
}

function fb_updateSearchQueries(query) {
    var newPostKey = firebase.database().ref().child('beta_analytics/search_queries').push().key;
    var updates = {};
    var entry_data = {query: query, timestamp: Date.now()};
    updates['beta_analytics/search_queries/' + newPostKey] = entry_data;
    return firebase.database().ref().update(updates);
}

function fb_updateDBDownloads() {
    var newPostKey = firebase.database().ref().child('beta_analytics/db_downloads').push().key;
    var updates = {};
    var entry_data = {timestamp: Date.now()};
    updates['beta_analytics/db_downloads/' + newPostKey] = entry_data;
    return firebase.database().ref().update(updates);
}