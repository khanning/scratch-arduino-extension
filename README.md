Javascript extension for Scratch 2.0 and Arduino
==

This Scratch 2.0 extension lets you control an Arduino using the standard Firmata firmware

Instructions
--
1. Download and install the [Arduino IDE](http://arduino.cc)

2. Connect the Arduino to your computer's USB port

3. Open the Arduino IDE 
<br /><img src="http://khanning.github.io/scratch-arduino-extension/images/arduino.png" />

4. Go to ```File```> ```Examples``` > ```Firmata``` > ```Standard Firmata```
<br /><img src="http://khanning.github.io/scratch-arduino-extension/images/firmata.png" />

5. Upload the firmware to your Arduino

6. Download and install the [Scratch Browser Plugin](http://scratch.mit.edu/scratchr2/static/ext/download.html)

7. Open a new Scratch 2.0 project and click ```File``` > ```Upload from my computer```
<br /><img src="http://khanning.github.io/scratch-arduino-extension/images/upload.png" />

8. Upload the blank project ```Arduino Extension Blank Project.sb2``` available above
<br /><i>For Windows, use ```Arduino Extension Blank Project Win.sb2``` available in the [wintest](https://github.com/khanning/scratch-arduino-extension/tree/wintest) branch</i>

9. The Arduino blocks should now be available in the ```More Blocks``` category
<br /><img src="http://khanning.github.io/scratch-arduino-extension/images/moreblocks.png" />

10. The indicator light will turn green when the Arduino is connected
<br /><b>Connected</b>
<br /><img src="http://khanning.github.io/scratch-arduino-extension/images/connected.png" />
<br /><b>Not Connected</b>
<br /><img src="http://khanning.github.io/scratch-arduino-extension/images/disconnected.png" />

Known Issues
--
- There is a bug with the Scratch Browser Plugin on Windows where new devices are not detected if they are connected while the Scratch project is running. As a workaround make sure your Arduino is connected to the USB port prior to opening the Scratch project.
