/*
 *This program is free software: you can redistribute it and/or modify
 *it under the terms of the GNU General Public License as published by
 *the Free Software Foundation, either version 3 of the License, or
 *(at your option) any later version.
 *
 *This program is distributed in the hope that it will be useful,
 *but WITHOUT ANY WARRANTY; without even the implied warranty of
 *MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 *GNU General Public License for more details.
 *
 *You should have received a copy of the GNU General Public License
 *along with this program.  If not, see <http://www.gnu.org/licenses/>.
 */

(function(ext) {

  var PIN_MODE = 0xF4,
    REPORT_DIGITAL = 0xD0,
    REPORT_ANALOG = 0xC0,
    DIGITAL_MESSAGE = 0x90,
    START_SYSEX = 0xF0,
    END_SYSEX = 0xF7,
    QUERY_FIRMWARE = 0x79,
    REPORT_VERSION = 0xF9,
    ANALOG_MESSAGE = 0xE0,
    ANALOG_MAPPING_QUERY = 0x69,
    ANALOG_MAPPING_RESPONSE = 0x6A,
    CAPABILITY_QUERY = 0x6B,
    CAPABILITY_RESPONSE = 0x6C;

  var INPUT = 0x00,
    OUTPUT = 0x01,
    ANALOG = 0x02,
    PWM = 0x03,
    SERVO = 0x04,
    SHIFT = 0x05,
    I2C = 0x06;

  var LOW = 0,
    HIGH = 1;
  
  var MAX_DATA_BYTES = 4096;
  var MAX_PINS = 128;

  var parsingSysex = false,
    waitForData = 0,
    executeMultiByteCommand = 0,
    multiByteChannel = 0,
    sysexBytesRead = 0,
    storedInputData = new Uint8Array(MAX_DATA_BYTES);

  var digitalOutputData = new Uint8Array(16),
    digitalInputData = new Uint8Array(16),
    analogInputData = new Uint16Array(16);

  var analogChannel = new Uint8Array(MAX_PINS);
  var pinVals = {};
  var pinModes = [];
  for (var i = 0; i < 7; i++) pinModes[i] = [];
  var hwPins = {
    'servo 1': null,
    'servo 2': null,
    'servo 3': null,
    'servo 4': null,
    'led 1': null,
    'led 2': null,
    'led 3': null,
    'led 4': null,
    'rotation knob': null,
    'light sensor': null,
    'temperature sensor': null,
    'button 1': null,
    'button 2': null,
    'button 3': null,
    'button 4': null
  };

  var servoVals = {
    'servo 1': 0,
    'servo 2': 0,
    'servo 3': 0,
    'servo 4': 0
  };

  var majorVersion = 0,
    minorVersion = 0;
  
  var connected = false;
  var device = null;
  var inputData = null;

  // TEMPORARY WORKAROUND
  // Since _deviceRemoved is not used with Serial devices
  // ping device regularly to check connection
  var pinging = false;
  var pingCount = 0;
  var pinger = null;

  function init() {

    for (var i = 0; i < 16; i++) {
      var output = new Uint8Array([REPORT_DIGITAL | i, 0x01]);
      device.send(output.buffer);
    }

    queryCapabilities();

    // TEMPORARY WORKAROUND
    // Since _deviceRemoved is not used with Serial devices
    // ping device regularly to check connection
    pinger = setInterval(function() {
      if (pinging) {
        if (++pingCount > 6) {
          clearInterval(pinger);
          pinger = null;
          connected = false;
          if (device) device.close();
          device = null;
          return;
        }
      } else {
        if (!device) {
          clearInterval(pinger);
          pinger = null;
          return;
        }
        queryFirmware();
        pinging = true;
      }
    }, 100);
  }

  function hasCapability(pin, mode) {
    if (pinModes[mode].indexOf(pin) > -1)
      return true;
    else
      return false;
  }

  function queryFirmware() {
    var output = new Uint8Array([START_SYSEX, QUERY_FIRMWARE, END_SYSEX]);
    device.send(output.buffer);
  }
 
  function queryCapabilities() {
    console.log('Querying ' + device.id + ' capabilities');
    var msg = new Uint8Array([
        START_SYSEX, CAPABILITY_QUERY, END_SYSEX]);
    device.send(msg.buffer);
  }

  function queryAnalogMapping() {
    console.log('Querying ' + device.id + ' analog mapping');
    var msg = new Uint8Array([
        START_SYSEX, ANALOG_MAPPING_QUERY, END_SYSEX]);
    device.send(msg.buffer);
  }

  function setDigitalInputs(portNum, portData) {
    digitalInputData[portNum] = portData;
  }

  function setAnalogInput(pin, val) {
    analogInputData[pin] = val;
  }

  function setVersion(major, minor) {
    majorVersion = major;
    minorVersion = minor;
  }

  function processSysexMessage() {
    switch(storedInputData[0]) {
      case CAPABILITY_RESPONSE:
        for (var i = 1, pin = 0; pin < MAX_PINS; pin++) {
          while (storedInputData[i++] != 0x7F) {
            pinModes[storedInputData[i-1]].push(pin);
            i++; //Skip mode resolution
          }
          pinVals[pin] = 0;
          if (i == sysexBytesRead) break;
        }
        queryAnalogMapping();
        break;
      case ANALOG_MAPPING_RESPONSE:
        for (var pin = 0; pin < analogChannel.length; pin++)
          analogChannel[pin] = 127;
        for (var i = 1; i < sysexBytesRead; i++)
          analogChannel[i-1] = storedInputData[i];
        for (var pin = 0; pin < analogChannel.length; pin++) {
          if (analogChannel[pin] != 127) {
            var out = new Uint8Array([
                REPORT_ANALOG | analogChannel[pin], 0x01]);
            device.send(out.buffer);
          }
        }
        break;
      case QUERY_FIRMWARE:
        if (!connected) {
          clearInterval(poller);
          poller = null;
          clearTimeout(watchdog);
          watchdog = null;
          connected = true;
          setTimeout(init, 200);
        }
        pinging = false;
        pingCount = 0;
        break;
    }
  }

  function processInput(inputData) { 
    for (var i=0; i < inputData.length; i++) {
      
      if (parsingSysex) {
        if (inputData[i] == END_SYSEX) {
          parsingSysex = false;
          processSysexMessage();
        } else {
          storedInputData[sysexBytesRead++] = inputData[i];
        }
      } else if (waitForData > 0 && inputData[i] < 0x80) {
        storedInputData[--waitForData] = inputData[i];
        if (executeMultiByteCommand != 0 && waitForData == 0) {
          switch(executeMultiByteCommand) {
            case DIGITAL_MESSAGE:
              setDigitalInputs(multiByteChannel, (storedInputData[0] << 7) + storedInputData[1]);
              break;
            case ANALOG_MESSAGE:
              setAnalogInput(multiByteChannel, (storedInputData[0] << 7) + storedInputData[1]);
              break;
            case REPORT_VERSION:
              setVersion(storedInputData[1], storedInputData[0]);
              break;
          }
        }
      } else {
        if (inputData[i] < 0xF0) {
          command = inputData[i] & 0xF0;
          multiByteChannel = inputData[i] & 0x0F;
        } else {
          command = inputData[i];
        }
        switch(command) {
          case DIGITAL_MESSAGE:
          case ANALOG_MESSAGE:
          case REPORT_VERSION:
            waitForData = 2;
            executeMultiByteCommand = command;
            break;
          case START_SYSEX:
            parsingSysex = true;
            sysexBytesRead = 0;
            break;
        }
      }
    }
  }

  function pinMode(pin, mode) {
    var msg = new Uint8Array([PIN_MODE, pin, mode]);
    device.send(msg.buffer);
  }

  function analogRead(pin) {
    if (pin >= 0 && pin < pinModes[ANALOG].length) {
      return Math.round((analogInputData[pin] * 100) / 1023);
    } else {
      var valid = [];
      for (var i = 0; i < pinModes[ANALOG].length; i++)
        valid.push(i);
      console.log(valid.join(', '));
      alert('ERROR: valid analog pins are ' + valid.join(', '));
      return;
    }
  }

  function digitalRead(pin) {
    if (!hasCapability(pin, INPUT)) {
      alert('ERROR: valid input pins are ' + pinModes[INPUT].join(', '));
      return;
    }
    pinMode(pin, INPUT);
    return (digitalInputData[pin >> 3] >> (pin & 0x07)) & 0x01;
  }

  function analogWrite(pin, val) {
    if (!hasCapability(pin, PWM)) {
      alert('ERROR: valid PWM pins are ' + pinModes[PWM].join(', '));
      return;
    }
    if (val < 0) val = 0;
    else if (val > 100) val = 100
    val = Math.round((val / 100) * 255);
    if (pinVals[pin] == val) return;
    pinMode(pin, PWM);
    var msg = new Uint8Array([
        ANALOG_MESSAGE | (pin & 0x0F),
        val & 0x7F,
        val >> 7]);
    device.send(msg.buffer);
    pinVals[pin] = val;
  }

  function digitalWrite(pin, val) {
    if (!hasCapability(pin, OUTPUT)) {
      alert('ERROR: valid output pins are ' + pinModes[OUTPUT].join(', '));
      return;
    }
    var portNum = (pin >> 3) & 0x0F;
    if (val == LOW) {
      if (pinVals[pin] == val) return;
      pinVals[pin] = val;
      digitalOutputData[portNum] &= ~(1 << (pin & 0x07));
    } else {
      if (pinVals[pin] == 255) return;
      pinVals[pin] = 255;
      digitalOutputData[portNum] |= (1 << (pin & 0x07));
    }
    pinMode(pin, OUTPUT);
    var msg = new Uint8Array([
        DIGITAL_MESSAGE | portNum,
        digitalOutputData[portNum] & 0x7F,
        digitalOutputData[portNum] >> 0x07]);
    device.send(msg.buffer);
  }

  function rotateServo(servo, deg) {
    if (!hasCapability(hwPins[servo], SERVO)) {
      alert('ERROR: valid servo pins are ' + pinModes[SERVO].join(', '));
      return;
    }
    if (deg < 0) deg = 0;
    else if (deg > 180) deg = 180;
    pinMode(hwPins[servo], SERVO);
    var msg = new Uint8Array([
        ANALOG_MESSAGE | (hwPins[servo] & 0x0F),
        deg & 0x7F,
        deg >> 0x07]);
    device.send(msg.buffer);
    servoVals[servo] = deg;
  }

  ext.isConnected = function() {
    return connected;
  };

  ext.analogWrite = function(pin, val) {
    analogWrite(pin, val);
  };

  ext.digitalWrite = function(pin, val) {
    if (val == 'on')
      digitalWrite(pin, HIGH);
    else if (val == 'off')
      digitalWrite(pin, LOW);
  };

  ext.analogRead = function(pin) {
    return analogRead(pin);
  };

  ext.digitalRead = function(pin) {
    return digitalRead(pin);
  };

  ext.whenAnalogRead = function(pin, op, val) {
    if (pin >= 0 && pin < pinModes[ANALOG].length) {
      if (op == '>')
        return analogRead(pin) > val;
      else if (op == '<')
        return analogRead(pin) < val;
      else if (op == '=')
        return analogRead(pin) == val;
      else
        return false;
    }
  };

  ext.whenDigitalRead = function(pin, val) {
    if (hasCapability(pin, INPUT)) {
      if (val == 'on')
        return digitalRead(pin);
      else if (val == 'off')
        return digitalRead(pin) == false;
    }
  };

  ext.connectHW = function(hw, pin) {
    hwPins[hw] = pin;
  };

  ext.rotateServo = function(servo, deg) {
    rotateServo(servo, deg);
  };

  ext.changeServo = function(servo, change) {
    var deg = servoVals[servo] + change;
    rotateServo(servo, deg);
  };

  ext.digitalLED = function(led, val) {
    if (!hasCapability(hwPins[led], OUTPUT)) {
      alert('ERROR: valid output pins are ' + pinModes[OUTPUT].join(', '));
      return;
    }
    if (val == 'on')
      digitalWrite(hwPins[led], HIGH);
    else if (val == 'off')
      digitalWrite(hwPins[led], LOW);
  };

  ext.analogLED = function(led, val) {
    analogWrite(hwPins[led], val);
  };
  
  ext.readInput = function(hw) {
    return analogRead(hwPins[hw]);
  };

  ext.isButtonPressed = function(btn) {
    return digitalRead(hwPins[btn]);
  };

  ext.whenInput = function(hw, op, val) {
    if (op == '>')
      return analogRead(hwPins[hw]) > val;
    else if (op == '<')
      return analogRead(hwPins[hw]) < val;
    else if (op == '=')
      return analogRead(hwPins[hw]) == val;
    else
      return false;
  };
 
  ext._getStatus = function() {
    if (!connected)
      return { status:1, msg:'Disconnected' };
    else
      return { status:2, msg:'Connected' };
  };

  ext._deviceRemoved = function(dev) {
    console.log('Device removed');
    // Not currently implemented with serial devices
  };

  var potentialDevices = [];
  ext._deviceConnected = function(dev) {
    potentialDevices.push(dev);
    if (!device)
      tryNextDevice();
  };

  var poller = null;
  var watchdog = null;
  function tryNextDevice() {
    device = potentialDevices.shift();
    if (!device) return;

    device.open({ stopBits: 0, bitRate: 57600, ctsFlowControl: 0 });
    console.log('Attempting connection with ' + device.id);
    device.set_receive_handler(function(data) {
      var inputData = new Uint8Array(data);
      processInput(inputData);
    });

    poller = setInterval(function() {
      queryFirmware();
    }, 100);

    watchdog = setTimeout(function() {
      clearInterval(poller);
      poller = null;
      device.set_receive_handler(null);
      device.close();
      device = null;
      tryNextDevice();
    }, 5000);
  };

  ext._shutdown = function() {
    // TODO: Bring all pins down 
    if (device) device.close();
    if (poller) clearInterval(poller);
    device = null;
  };

  var descriptor = {
    blocks: [
      ['h', 'when device is connected', 'isConnected'],
      [' ', 'turn pin %n %m.outputs', 'digitalWrite', 3, 'on'],
      [' ', 'set pin %n to %n%', 'analogWrite', 9, 100],
      ['b', 'pin %n on?', 'digitalRead', 1],
      ['r', 'read analog pin %n', 'analogRead', 0], 
      ['h', 'when pin %n is %m.outputs', 'whenDigitalRead', 1, 'on'],
      ['h', 'when analog pin %n %m.ops %n%', 'whenAnalogRead', 1, '>', 50],
      [' ', 'connect %m.hwOut to pin %n', 'connectHW', 'servo 1', 3],
      [' ', 'rotate %m.servos to %n degrees', 'rotateServo', 'servo 1', 180],
      [' ', 'rotate %m.servos by %n degrees', 'changeServo', 'servo 1', 20],
      [' ', 'turn %m.leds %m.outputs', 'digitalLED', 'led 1', 'on'],
      [' ', 'set %m.leds brightness to %n%', 'analogLED', 'led 1', 100],
      [' ', 'connect %m.hwIn to analog pin %n', 'connectHW', 'rotation knob', 0],
      ['r', 'read %m.hwIn', 'readInput', 'rotation knob'],
      ['h', 'when %m.hwIn %m.ops %n%', 'whenInput', 'rotation knob', '>', 50],
      [' ', 'connect %m.btns to pin %n', 'connectHW', 'button 1', 3],
      ['b', '%m.buttons pressed?', 'isButtonPressed', 'button 1']
    ],
    menus: {
      btns: ['button 1', 'button 2', 'button 3', 'button 4'],
      hwIn: ['rotation knob', 'light sensor', 'temperature sensor'],
      hwOut: ['servo 1', 'servo 2', 'servo 3', 'servo 4', 'led 1', 'led 2', 'led 3', 'led 4'],
      leds: ['led 1', 'led 2', 'led 3', 'led 4'],
      outputs: ['on', 'off'],
      ops: ['>', '=', '<'],
      modes: ['OUTPUT', 'INPUT', 'PULL_UP'],
      servos: ['servo 1', 'servo 2', 'servo 3', 'servo 4']
    },  
    url: 'http://arduino.cc'
  };

  ScratchExtensions.register('Arduino', descriptor, ext, {type:'serial'});

})({});
