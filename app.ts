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
      if(!req.body.picToken || !req.body.directoryType) {
        serverLog("picToken or directoryType in body had no value")
        return;
      }
      const folderName = ("MediaFolder_" + (new Date()).toUTCString()).replace(/\s/g, '').replace(/\:/g, "").replace(',', '')
      const uploadsTempFolder = `./MediaTempFiles/${req.body.directoryType}/${req.body.picToken}/${folderName}`
      const folderCreationTempResult = await checkCreateUploadsFolder(uploadsTempFolder)
      if(folderCreationTempResult){
        serverLog(`Temp directory in ${req.body.directoryType} created`)
        return res.json({ ok: true , folderName })       
      }
      return res.json({ ok: false })
  })
  app.post('/CheckTempDirectory', async (req : any, res : any) => {
    serverLog("Checking temp files exists...")
    if(!req.body.picToken || !req.body.folderName || !req.body.directoryType) {
      serverLog("picToken or folderName or directoryType in body had no value")
      return;
    }
    const uploadsTempFolder = `./MediaTempFiles/${req.body.directoryType}/${req.body.picToken}/${req.body.folderName}`
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
    if(!req.body.picToken && !req.body.folderName && !req.body.tempFiles || !req.body.directoryType){
      serverLog("PicToken or file name or post files or directory type in body had no value")
      return;
    }
    if (req.body.tempFiles){
      if(req.body.tempFiles.length == 0) return res.json({ ok: true })
        serverLog("Creating directory...")
        let tempDirectory = `./MediaTempFiles/${req.body.directoryType}/${req.body.picToken}/${req.body.folderName}`
        let directory = `./MediaFiles/${req.body.directoryType}/${req.body.picToken}/${req.body.folderName}`
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
    if(!req.body.picToken && !req.body.picType && !req.body.fileName){
      serverLog("PicToken or file name or picType in body had no value")
      return;
    }
    let picType : string = req.body.picType +"Pic" 
    serverLog(`Moving pic from temp to ${picType}`)
    let tempDirectory = `./MediaTempFiles/${picType}/${req.body.picToken}/${req.body.fileName}`
    let directory = `./MediaFiles/${picType}/${req.body.picToken}/${req.body.fileName}`
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
    const picToken = req.query.picToken;
    const folderName = req.query.folderName;
    const directoryFolder = req.query.directoryFolder;
    if (!picToken || !folderName) res.json({ ok: false, error: `Pictoken: ${picToken} or folderName: ${folderName} not found or directoryFolder: ${directoryFolder} not found` })
    const uploadsTempFolder = `./MediaTempFiles/${directoryFolder}/${picToken}/${folderName}/`
    
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
    let picToken = req.query.picToken;
    let picType = req.query.picType ? req.query.picType.trim() +'Pic' : null

    if (!picToken || !picType) res.json({ ok: false, error: 'Pictoken or picType not found' })
    if (picType !== "WallpaperPic" && picType !== "ProfilePic") res.json({ ok: false, error: 'Picture param invalid' })

    const uploadsTempFolder = `./MediaTempFiles/${picType}/${picToken}`
    const uploadsFolder = `./MediaFiles/${picType}/${picToken}`

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
        serverLog(`Uploaded file: ${fileName} to ${picType}`)
        return res.json({ ok: true, fileName })
      })
    })
  })
  app.post('/createPicTokenDirectory', async (req : any, res : any) => {
    let picToken = req.body.picToken;
    if(!picToken) return res.json({ ok: false })
    
    let profDir = './MediaFiles/ProfilePic/' + picToken;
    let wallDir = './MediaFiles/WallpaperPic/' + picToken;
    let postMediaDir = './MediaFiles/PostFiles/' + picToken;
    let chatMediaDir = './MediaFiles/ChatFiles/' + picToken;
    
    let tempProfDir = './MediaTempFiles/ProfilePic/' + picToken;
    let tempWallDir = './MediaTempFiles/WallpaperPic/' + picToken;
    let tempPostMediaDir = './MediaTempFiles/PostFiles/' + picToken;
    let tempChatMediaDir = './MediaTempFiles/ChatFiles/' + picToken;
    
    serverLog("Checking directory folders with token " + picToken);

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
