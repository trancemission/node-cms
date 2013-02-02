/* Module dependencies. */
var express = require("express");
var cons  = require('consolidate');
var template  = require('swig');
var mongojs = require('mongojs');
var qs = require('qs');
var ObjectId = mongojs.ObjectId;
var util = require('util');




/* Initialise */

// Express
var app = express();
app.engine('.html', cons.swig);
app.set('view engine', 'html');
app.use(express.cookieParser());
app.use(express.bodyParser());

// DB
db = mongojs('localhost/cms', ['pages']);
photosDb = mongojs('localhost/cms', ['photos']);
jobDb = mongojs('localhost/cms', ['jobs']);
sessionDb= mongojs('localhost/cms', ['sessions']);


// Where to expect image uploads
var imgUploadDir = '/srv/taylorm.net/www/htdocs/img/uploads';
// Where to put them
var imgPhotoDir = '/srv/taylorm.net/www/htdocs/img/photos';

/* This helps it know where to look for includes and parent templates */
template.init({
    root: '/srv/taylorm.net/node/apps/cms/html/',
    allowErrors: true // allows errors to be thrown and caught by express instead of suppressed by Swig
});

// Set folder containing HTML templates....
app.set('views', '/srv/taylorm.net/node/apps/cms/html/');
app.set('uploadDir', '../../../www/htdocs/img/photos');

function sessionHandler (req, res, next) 
{
    if(req.cookies.tid)
    {
//        console.log('We welcome them: '+req.cookies.tid);
    }
    else
    {
        sessionId = new ObjectId();
        res.cookie('tid', sessionId, {  httpOnly: true });
        console.log('Lets give em a session id: '+sessionId);

        sessionDb.sessions.insert({
                _id : sessionId,
                date:Date(),
                last:'Started Session'
        },{safe:true}, function(err,post)
        {
        });
    }
   // keep executing the router middleware
   next()
}

app.use(sessionHandler)
// Queu jobs



// Start Routing
app.get('/session',function(req,res)
{
    res.send('Hi');

});

// Default index page
app.get('/', function(req, res){
    var user = req.cookies.username;
    res.render('index.html', { username: user });
});

/* PHOTOS */
app.get('/photos',function(req,res)
{

    photosDb.photos.find(function(err, photosArray) {
        res.render('photos.html', {title:'Photos', photos:photosArray});
    });
});




/* BLOG */
app.get('/blog',function(req,res)
{
    res.render('blog/index.html');
});


app.get('/feeds',function(req, res)
{
var request = require('request');
var fs = require('fs'),
    xml2js = require('xml2js');

var parser = new xml2js.Parser();
fs.readFile(__dirname + '/slashdot', function(err, data) {
    parser.parseString(data, function (err, result) {

        res.send(result);
console.log(util.inspect(result, false, null))
        console.log('Done');
    });
});


});


/* ADMIN SECTION */

/* DEFAULT - SHOW UPLOAD FORM */
app.get('/admin/photos',function(req,res)
{
    var fs = require('fs');
    newFiles = fs.readdirSync(imgUploadDir);
    /*
    for (var i in newFiles)
    {
        fileName = newFiles[i];
        fileList[fileName] = { 'Thumbnail' : 1 , 'Date': 'When'};
       var currentFile = imgUploadDir + '/' + newFiles[i];
       var stats = fs.statSync(currentFile);
       if (stats.isFile()) 
       {
            // console.log(currentFile);
            // console.log(stats);
            fileName = newFiles[1];
            fileType = "image/jpeg";
            photosDb.photos.insert({
                    name:fileName,
                    fname:fileName,
                    ftype:fileType
            },function(err,post)
            {
                id = post[0]._id; // Last inserted ID

                var serverPath = '/srv/taylorm.net/www/htdocs/img/photos/' + id;
                require('fs').rename(currentFile,serverPath,function(error) {
                    if(error) {
                            console.log(error);
                        res.send({
                            error: 'Ah crap! Something bad happened' + id
                        });
                    }
                });
            });
       }
    }
    */

    jobDb.jobs.find( { sess : req.cookies.tid } ,function(err, qArray) {
        //res.render('admin/pages.html', {title:'Pages', pages:pagesArray});
        res.render('admin/photo_upload.html', {title:'Photos', section:'photo' , fileList:newFiles, qList:qArray } );
    });
}); 

app.post('/admin/photos/queue/start',function(req,res)
{
    tid = req.cookies.tid;
    jobDb.jobs.update( { 'sess' : req.cookies.tid } , {$set : { 'status' : 'q' } } , {multi:true} ,function(err,post)
    {
        console.log(req.cookies.tid);
        if(err)
        {
        console.log(err);
        }
        else
        {
            startQ(tid);
        }

    });
    var result = {};
    result.ok = 1;
    result.redirect = '/admin/photos/';
    res.send(result);
});
app.post('/admin/photos/queue',function(req,res)
{
    var result = {};
    for(fileName in req.body.images)
    {
        addToQueue(fileName,req.cookies.tid);
    }
    result.ok = 1;
    result.redirect = '/admin/photos/';
    res.send(result);
});
app.post('/admin/photos/save',function(req,res)
{
    var result = {};
    result.ok = 1;
    //req.body = qs.parse(req.body);
    console.log(req.body.images);
    for(fileName in req.body.images)
    {
        console.log('We are doing image: '+fileName);
        if(!addToQueue(fileName))
        {
            result.ok = 2;
        }
        if(!insertRec(fileName))
        {
            result.ok = 2;
        }

    }
    result.redirect = '/admin/photos/';
    res.send(result);

});
app.post('/admin/photos/thumbs/create',function(req,res)
{
    result = {};
    result.ok = 1;
    result.redirect='/admin/photos';
    res.send(result);


});
function addToQueue(fileName,sessionId)
{
    i=0;
    jobDb.jobs.insert({
            name:fileName,
            type:'mv_photo',
            sess:sessionId,
            status:'w',
            date:new Date(),
    },{safe:true}, function(err,post)
    {
        id = post[0]._id; // Last inserted ID
        console.log('We have inserterd : '+fileName+' id: '+id+' into JOBS');
    });
}

function startQ(tid)
{

    var fileName;
    jobDb.jobs.find( { sess : tid , status : 'q'  } ,function(err, qArray) {
        console.log(qArray);
        for(var f in qArray)
        {
            fileName = qArray[f].name;
            jobId = qArray[f]._id;
            insertRec(fileName,jobId);
        }
    });

}


function insertRec(fileName, jobId)
{
    i=0;
    photosDb.photos.insert({
            name:fileName,
            fname:fileName
    },{safe:true}, function(err,post)
    {
        id = post[0]._id; // Last inserted ID
        console.log('We have inserterd : '+fileName+' with '+id);
        moveFile(fileName,id, jobId);
    });
}

function doneRec(fileName,jobId)
{
    i=0;
    jobDb.jobs.update({
            _id:jobId
            },
            { 'status' : 'd' }, 
    {safe:true}, function(err,post)
    {
        console.log('We updated jobId: '+jobId);
        removeFile(fileName);
    });
}
function removeFile(fileName)
{
    srcFile = '/srv/taylorm.net/www/htdocs/img/uploads/' + fileName;
    //require('fs').unlink(srcFile);
    console.log('delete the file: '+fileName);
}
function moveFile(fileName, id, jobId)
{
    fileExt = fileName;
    ext = fileExt.split('.').pop();
    var im = require('imagemagick');
    var srcFile = '/srv/taylorm.net/www/htdocs/img/uploads/' + fileName;
    var serverPath = '/srv/taylorm.net/www/htdocs/img/photos/' + id +'.'+ext;
    var thumbPath = '/srv/taylorm.net/www/htdocs/img/photos/thumbs/'+id+'.png';

    im.resize({ srcPath:srcFile,dstPath:thumbPath,width:138}, function(err, stdout, stderr)
    {
      console.log('We are renaming '+fileName+' with id: '+id+' and jobId: '+jobId);
      if (err) throw err;
      fs = require('fs').rename(srcFile,serverPath,function(error) 
      {
          if(error)
          {
              console.log('ERROR: '+error);
          }
          else
          {
              console.log('Moved File: '+srcFile);
              doneRec(fileName,jobId);
          }
      });
      //fs.createReadStream(srcFile).pipe(fs.createWriteStream(serverPath));
    });


}


/* UPLOAD PHOTO */
app.post('/admin/photos/upload',function(req,res)
{

    //console.log(req.files.uploadedFile);
    fileName = req.files.uploadedFile.name;
    fileType = req.files.uploadedFile.type;
    fileSize = req.files.uploadedFile.size;
    fileDate = req.files.uploadedFile.lastModifiedDate;
    photosDb.photos.insert({
            name:req.body.photo_name ,
            fname:fileName,
            ftype:fileType,
            fsize:fileSize,
            uploadDate:fileDate,
            album:req.body.album
    },function(err,post)
    {
        id = post[0]._id; // Last inserted ID

        serverPath = '/srv/taylorm.net/www/htdocs/img/photos/' + id;
        require('fs').rename(req.files.uploadedFile.path,serverPath,function(error) {
            if(error) {
                res.send({
                    error: 'Ah crap! Something bad happened'
                });
                return;
            }
            res.redirect('/admin/photos');
        });
    });

    //res.send(console.dir(req.files));  // DEBUG: display available fields
    //res.render('admin/photo_upload.html');
}); 



app.get('/admin',function(req, res){
    // Load our pages
    res.render('admin/index.html', {title:'Admin'});
});



app.get('/admin/pages',function(req, res){
    // Load our pages
    db.pages.find(function(err, pagesArray) {
        res.render('admin/pages.html', {title:'Pages', pages:pagesArray});
    });
});

app.get('/admin/pages/remove/:id',function(req, res){
    id = req.params.id;
    saveId = ObjectId(id);
    db.pages.remove({ _id:saveId},function(err,field)
    {
        res.redirect('/admin/pages');
    });
});

app.get('/admin/pages/add',function(req, res)
{
    res.render('admin/page_add.html');
});

/* ADMIN SAVE SECTION */
app.post('/admin/pages/save',function(req, res)
{
    db.pages.insert({
            name:req.body.page_name ,
            level:req.body.page_level ,
            status:req.body.page_status ,
            html:req.body.page_html ,
    },function(err,post)
    {
        res.redirect('/admin/pages');
    });
});

/*
var io = require('socket.io').listen(3100);
io.sockets.on('connection', function (socket) {
    socket.on('message', function (message) {
        console.log("Got message: " + message);
        io.sockets.emit('message', message );
    });
});
*/
/*
request('http://rss.slashdot.org/Slashdot/slashdot', function (error, response, body) {
  if (!error && response.statusCode == 200) {
var parser = require('xml2json');
        var json = parser.toJson(body); //returns a string containing the JSON structure by default
        //console.log(JSON.parse(json.rss.channel.item));
        jsonList = JSON.parse(json);
        rssList  = JSON.parse(jsonList);
        for( item in rssList)
        {
            console.log(item);
        }
        // res.send(json.rss.channel.item);
  }
})
*/

app.listen(3000);
