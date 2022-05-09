require('dotenv').config();
//server initiate
export {}
const express = require('express')
const formidable = require('formidable');
const bluebird = require('bluebird')
const app = express()
app.use(express.json())

const serverManager = require('http').Server(app)

  const sql = require('mssql');
  const fs = bluebird.promisifyAll(require('fs'));
  const path = require('path');
  
  
  function serverLog(text : string) {
    console.log("Storage Node Server =>", text);
  }
  
  serverManager.listen((process as any).env.PORT, () => serverLog(`Listening on port ${(process as any).env.PORT}`));

  app.use('/MediaFiles',express.static('MediaFiles'))

  async function checkCreateUploadsFolder(uploadsFolder : string) {
    try {
      await fs.statAsync(uploadsFolder)
      serverLog('Directory already exist')
    } catch (e) {
      if (e && e.code == 'ENOENT') {
        serverLog('The uploads folder doesn\'t exist, creating a new one...')
        try {
          await fs.mkdirAsync(uploadsFolder);
          serverLog('New directory created')
        } catch (err) {
          serverLog('Error upload folder with mkdirAsync')
          return false
        }
      } else {
        serverLog('Error upload folder with statAsync')
        return false
      }
    }
    return true
  }

  // Returns true or false depending on whether the file is an accepted type
  function checkExtension(file : any , isProfile : boolean) {
    serverLog("Checking file type of "+file.mimetype)
    const type = file.mimetype.replace("video/","").replace("image/","")
    let acceptedVideo = ['mp4', 'mov', 'avi', 'mkv', 'x-matroska']
    let acceptedImage = ['jpeg', 'jpg', 'png']
    if(isProfile){
      if (acceptedImage.indexOf(type) == -1) {
        return false
      }
    }else {
      if (acceptedVideo.indexOf(type) == -1 && acceptedImage.indexOf(type) == -1) {
        return false
      }
    }
    return type
  }
  app.post('/CreateTempDirectory', async (req : any, res : any) => {
      serverLog("Creating Temp Directory...")
      if(!req.body.token || !req.body.directoryType) {
        serverLog("token or directoryType in body had no value")
        return;
      }
      const folderName = ("MediaFolder_" + (new Date()).toUTCString()).replace(/\s/g, '').replace(/\:/g, "").replace(',', '')
      const uploadsTempFolder = `./MediaTempFiles/${req.body.directoryType}/${req.body.token}/${folderName}`
      const folderCreationTempResult = await checkCreateUploadsFolder(uploadsTempFolder)
      if(folderCreationTempResult){
        serverLog(`Temp directory in ${req.body.directoryType} created`)
        return res.json({ ok: true , folderName })       
      }
      return res.json({ ok: false })
  })
  app.post('/CheckTempDirectory', async (req : any, res : any) => {
    serverLog("Checking temp files exists...")
    if(!req.body.token || !req.body.folderName || !req.body.directoryType) {
      serverLog("token or folderName or directoryType in body had no value")
      return;
    }
    const uploadsTempFolder = `./MediaTempFiles/${req.body.directoryType}/${req.body.token}/${req.body.folderName}`
    const checkExist = await checkCreateUploadsFolder(uploadsTempFolder)
    if(!checkExist) return res.json({ ok: false })

    await fs.readdirAsync(uploadsTempFolder, (err : any, files : any) => {
      if(err){
        return res.json({ ok: false })
      }
      let tempFiles : string[] = [];
      files.forEach((file : string) => {
        tempFiles.push(file);
      });
      serverLog(`Fetched all files in ${req.body.directoryType}`)
      return res.json({ ok: true  , tempFiles})
    });
    return res.json({ ok: false })
  })
  app.post('/CreateDirectory', async (req : any, res : any) => {
    if(!req.body.token && !req.body.folderName && !req.body.tempFiles || !req.body.directoryType){
      serverLog("PicToken or file name or post files or directory type in body had no value")
      return;
    }
    if (req.body.tempFiles){
      if(req.body.tempFiles.length == 0) return res.json({ ok: true })
        serverLog("Creating directory...")
        let tempDirectory = `./MediaTempFiles/${req.body.directoryType}/${req.body.token}/${req.body.folderName}`
        let directory = `./MediaFiles/${req.body.directoryType}/${req.body.token}/${req.body.folderName}`
        fs.mkdirAsync(directory);
        serverLog("Moving files...")
        req.body.tempFiles.forEach((value : string , index : number) => {
          fs.renameAsync(tempDirectory + '/' + value, directory + '/' + value, function (err : any) {
            if (err){
               serverLog('ERROR: ' + err);
              return res.json({ ok: false })
            }
            serverLog(`File moved: ${value}`)
            if(index == req.body.tempFiles.length - 1){
              serverLog(`All files moved async from temp in ${req.body.directoryType}`)
              return res.json({ ok: true })
            }
          });
        })
      }
  })
  app.post('/MovePicDirectory', async (req : any, res : any) => {
    if(!req.body.token && !req.body.prof && !req.body.fileName){
      serverLog("PicToken or file name or prof in body had no value")
      return;
    }
    let prof : string = req.body.prof +"Pic" 
    serverLog(`Moving pic from temp to ${prof}`)
    let tempDirectory = `./MediaTempFiles/${prof}/${req.body.token}/${req.body.fileName}`
    let directory = `./MediaFiles/${prof}/${req.body.token}/${req.body.fileName}`
    fs.renameAsync(tempDirectory, directory, function (err : any) {
      if (err){
          serverLog('ERROR: ' + err);
        return res.json({ ok: false })
      }
      serverLog(`File moved: ${req.body.fileName}`)
    });
    return res.json({ ok: true })
  })
  app.post('/upload', async (req : any, res : any) => {
    let form = new formidable.IncomingForm()
    const token = req.query.token;
    const folderName = req.query.folderName;
    const directoryFolder = req.query.directoryFolder;
    if (!token || !folderName) res.json({ ok: false, error: `Pictoken: ${token} or folderName: ${folderName} not found or directoryFolder: ${directoryFolder} not found` })
    const uploadsTempFolder = `./MediaTempFiles/${directoryFolder}/${token}/${folderName}/`
    
    form.multiples = false;
    form.uploadDir = uploadsTempFolder
    form.maxFileSize = 100 * 1024 * 1024 // 100 MB
    // form.keepExtensions = true;
    form.once('error', console.error);
    form.on('fileBegin', (formname : any, file : any) => {
      if (!file) {
        serverLog('No file selected')
        return res.json({ ok: false, error: 'No file selected' })
      }
      const type = checkExtension(file , false);
      if (!type) return res.json({ ok: false, error: 'Invalid file type' })
      const fileName = file.newFilename + "." + type
      file.filepath = form.uploadDir  +  "/" + fileName;
      //fs.renameAsync(file.filepath, form.uploadDir + "/" + fileName);
    });
    form.on('file', function(field : any, file : any) {

    });
    form.on('error', function(err : any) {
      serverLog("An error has occured with form upload");
        console.error(err);
        //req.resume();
        return res.json({ ok: false, error: err })
    });
    form.on('aborted', function(err : any) {
      serverLog("user aborted upload");
      return res.json({ ok: false, error: "Aborted file upload" })
    });
    form.on('end', function() {
      if(!res.writableEnded){
        serverLog(`Uploaded file to temp ${directoryFolder}`)
        return res.json({ ok: true })
      }
    });
    form.parse(req, function() {
  
    });
  })

  app.post('/profileUpload', async (req : any, res : any) => {
    let form = new formidable.IncomingForm()
    let token = req.query.token;
    let prof = req.query.prof ? req.query.prof.trim() +'Pic' : null

    if (!token || !prof) res.json({ ok: false, error: 'Pictoken or prof not found' })
    if (prof !== "WallpaperPic" && prof !== "ProfilePic") res.json({ ok: false, error: 'Picture param invalid' })

    const uploadsTempFolder = `./MediaTempFiles/${prof}/${token}`
    const uploadsFolder = `./MediaFiles/${prof}/${token}`

    form.multiples = false
    form.uploadDir = uploadsTempFolder
    form.maxFileSize = 100 * 1024 * 1024 // 100 MB

    const folderCreationTempResult = await checkCreateUploadsFolder(uploadsTempFolder)
    const folderCreationResult = await checkCreateUploadsFolder(uploadsFolder)
    if (!folderCreationTempResult || !folderCreationResult)
      return res.json({ ok: false, error: "The uploads folder wasn't found" })
    fs.readdirAsync(uploadsTempFolder, (err : any, tempfiles : any) => {
      if (err) throw err;
      for (const tempfile of tempfiles) {
        fs.unlinkAsync(path.join(uploadsTempFolder, tempfile), (err : any) => {
          if (err) console.error(err);
        });
      }
      form.parse(req, async (err: any, fields: any, files: any) => {
        if (err) {
          serverLog('Error parsing the incoming form')
          return res.json({ ok: false, error: 'Error passing the incoming form' })
        }
        if (!files.files) {
          serverLog('No file selected')
          return res.json({ ok: false, error: 'No file selected' })
        }
        if (!fields.email) {
          serverLog('Signin required to upload pic')
          return res.json({ ok: false, error: 'Signin required to upload pic' })
        }
        const file = files.files
        const type = checkExtension(file , true)
        if (!type) return res.json({ ok: false, error: 'Invalid file type' })

        const fileName = file.newFilename +"." + type
        await fs.renameAsync(file.filepath, path.join(uploadsTempFolder, fileName))
        serverLog(`Uploaded file: ${fileName} to ${prof}`)
        return res.json({ ok: true, fileName })
      })
    })
  })
  app.post('/createPicTokenDirectory', async (req : any, res : any) => {
    let token = req.body.token;
    if(!token) return res.json({ ok: false })
    
    let profDir = './MediaFiles/ProfilePic/' + token;
    let wallDir = './MediaFiles/WallpaperPic/' + token;
    let postMediaDir = './MediaFiles/PostFiles/' + token;
    let chatMediaDir = './MediaFiles/ChatFiles/' + token;
    
    let tempProfDir = './MediaTempFiles/ProfilePic/' + token;
    let tempWallDir = './MediaTempFiles/WallpaperPic/' + token;
    let tempPostMediaDir = './MediaTempFiles/PostFiles/' + token;
    let tempChatMediaDir = './MediaTempFiles/ChatFiles/' + token;
    
    serverLog("Checking directory folders with token " + token);

    const profDirResult = await checkCreateUploadsFolder(profDir)
    const wallDirResult = await checkCreateUploadsFolder(wallDir)
    const postMediaDirResult = await checkCreateUploadsFolder(postMediaDir)
    const chatMediaDirResult = await checkCreateUploadsFolder(chatMediaDir)

    const tempProfDirResult = await checkCreateUploadsFolder(tempProfDir)
    const tempWallDirResult = await checkCreateUploadsFolder(tempWallDir)
    const tempPostMediaDirResult = await checkCreateUploadsFolder(tempPostMediaDir)
    const tempChatMediaDirResult = await checkCreateUploadsFolder(tempChatMediaDir)
    
    if(profDirResult && wallDirResult && postMediaDirResult && tempProfDirResult && tempWallDirResult && tempPostMediaDirResult && chatMediaDirResult && tempChatMediaDirResult)
      return res.json({ ok: true })
    else
      return res.json({ ok: false })
  })
