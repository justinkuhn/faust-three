
'use strict';
// Faust part
if (!window.dspName) window.dspName = "mydsp";
const audioCtx = new (window.AudioContext || window.webkitAudioContext)(({ latencyHint: 0.00001 }));
audioCtx.destination.channelInterpretation = "discrete";
let audioInput, dspNode, $faustUI;
let dspOutputHandler = () => {};

// MIDI input handling
const midiMessageReceived = e => {
   if (!dspNode) return;
   const cmd = e.data[0] >> 4;
   const channel = e.data[0] & 0xf;
   const data1 = e.data[1];
   const data2 = e.data[2];
   if (channel === 9) return;
   else if (cmd === 11) dspNode.ctrlChange(channel, data1, data2);
   else if (cmd === 14) dspNode.pitchWheel(channel, (data2 * 128.0 + data1));
}
const activateMIDIInput = () => {
   console.log("activateMIDIInput");
   const onError = error => console.error(error);
   const onSuccess = access => {
      access.onstatechange = e => {
            if (e.port.type === "input") {
               if (e.port.state === "connected") {
                  console.log(e.port.name + " is connected");
                  e.port.onmidimessage = midiMessageReceived;
               } else if (e.port.state  === "disconnected") {
                  console.log(e.port.name + " is disconnected");
                  e.port.onmidimessage = null;
               }
            }
      }
      for (const input of access.inputs.values()) {
            input.onmidimessage = midiMessageReceived;
            console.log(input.name + " is connected");
      }
   }

   if (navigator.requestMIDIAccess) {
      navigator.requestMIDIAccess().then(onSuccess, onError);
   } else {
      alert("MIDI input cannot be activated, either your browser still does't have it, or you need to explicitly activate it.");
   }
}

// Audio input handling
const activateAudioInput = () => {
   if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      const onSuccess = device => {
            audioInput = audioCtx.createMediaStreamSource(device); // Create an AudioNode from the stream.
            audioInput.connect(dspNode); // Connect it to the destination.
      };

      const onError = e => {
            alert('Error getting audio input');
            console.error(e);
            audioInput = null;
      };

      navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false } })
            .then(onSuccess)
            .catch(onError);
   } else {
      alert('Audio input API not available');
   }
}

// Save/Load functions using local storage
const getStorageItemValue = (item_key, key) => { // get item from local storage 'item_key' key
   if (!localStorage.getItem(item_key)) return null;
   const item_value = JSON.parse(localStorage.getItem(item_key));
   const item_index = item_value.findIndex(obj => obj[0] === key);
   return item_index >= 0 ? item_value[item_index][1] : null;
}

const setStorageItemValue = (item_key, key, value) => { // set [key, value] in local storage item_key key
   let item_value = [];
   if (localStorage.getItem(item_key)) item_value = JSON.parse(localStorage.getItem(item_key));
   const item_index = item_value.findIndex((obj => obj[0] === key)); // Possibly update an existing 'key'
   if (item_index >= 0) item_value[item_index][1] = value; // Otherwise push a new [key, value]
   else item_value.push([key, value]);
   localStorage.setItem(item_key, JSON.stringify(item_value));
}

const savedrumsState = () => {
   dspNode.getParams().forEach(param => {
      setStorageItemValue('drums', param, dspNode.getParamValue(param));
   })
}

const loaddrumsState = () => {
   dspNode.getParams().forEach(param => {
      //justin stuff
      console.log(param);


      const value = getStorageItemValue('drums', param);

      console.log(value);
      
      if (typeof value === "number") {
            dspNode.setParamValue(param, parseFloat(value)); // Restore drums state
            dspOutputHandler(param, parseFloat(value)); // Restore GUI state
      }
   })
}

const initdrums = bufferSizeIn => {
   if (typeof WebAssembly === "undefined") return alert("WebAssembly is not supported in this browser !");
   if (!window[dspName]) return console.error(dspName + " instance not found.");
   const bufferSize = bufferSizeIn || 1024;
   window[dspName].createdrums(audioCtx, bufferSize)
   .then(dsp => {
      if (!dsp) return console.error("Error in drums creation.");
      if (dspNode) { // destroy current
            dspNode.disconnect(audioCtx.destination);
            if (audioInput) audioInput.disconnect(dspNode);
      }
      dspNode = dsp;
      if (dspNode.getNumInputs() > 0) activateAudioInput();
      dspNode.connect(audioCtx.destination);
      // console.log(dspNode.getJSON());
      // TODO: emcc
      // dspNode.metadata({ declare: function(key, value) { console.log("key = " + key + " value = " + value); }});
      // console.log(dspNode.getParams());
      if (typeof _f4u$t === "undefined") return;
      if (typeof $ === "undefined") return;
      if ($faustUI) $faustUI.remove();
      $faustUI = $("<div>");
      $("body").append($faustUI);
      dspOutputHandler = _f4u$t.main(dspNode.getJSON(), $faustUI, (path, val) => dspNode.setParamValue(path, val));
      dspNode.setOutputParamHandler(dspOutputHandler);
   
      loaddrumsState(); // Load drums state from local storage
   });
}
// To activate audio on iOS
window.addEventListener("touchstart", () => {
   if (audioCtx.state !== "suspended") return;
   const buffer = audioCtx.createBuffer(1, 1, 22050);
   const source = audioCtx.createBufferSource(); // create empty buffer
   source.buffer = buffer;
   source.connect(audioCtx.destination); // connect to output (your speakers)
   source.start(); // play the file
   audioCtx.resume().then(() => console.log("Audio resumed"));
}, false);

// On desktop
window.addEventListener("mousedown", () => {
   if (audioCtx.state !== "suspended") return;
   audioCtx.resume().then(() => console.log("Audio resumed"))
});

if (typeof _f4u$t !== "undefined") _f4u$t.main_loop = () => {}; // No polling from the server needed, so use an empty loop

// Start monophonic instrument
if (typeof Module !== "undefined") {
   console.log("Compiled with EMCC");
   Module['onRuntimeInitialized'] = initdrums;
} else {
   console.log("Compiled with WASM backend");
   initdrums();
   activateMIDIInput();
}

// Save drums state to local storage
setInterval(() => dspNode ? savedrumsState() : null, 1000);
