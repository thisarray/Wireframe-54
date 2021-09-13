/*
 * Integer number of memory locations in bytes.
 */
const RAM_SIZE = 4096;

/*
 * Integer size of each opcode in bytes.
 */
const OPCODE_SIZE = 2;

/*
 * Integer starting address for programs.
 */
const START_ADDRESS = 0x200;

/*
 * Integer number of 8-bit data registers.
 */
const REGISTER_COUNT = 16;

/*
 * Integer horizontal display resolution in pixels.
 */
const DISPLAY_WIDTH = 64;

/*
 * Integer vertical display resolution in pixels.
 */
const DISPLAY_HEIGHT = 32;

/*
 * Array of font sprites.
 */
const FONT = [
  0xF0, 0x90, 0x90, 0x90, 0xF0, // 0
  0x20, 0x60, 0x20, 0x20, 0x70, // 1
  0xF0, 0x10, 0xF0, 0x80, 0xF0, // 2
  0xF0, 0x10, 0xF0, 0x10, 0xF0, // 3
  0x90, 0x90, 0xF0, 0x10, 0x10, // 4
  0xF0, 0x80, 0xF0, 0x10, 0xF0, // 5
  0xF0, 0x80, 0xF0, 0x90, 0xF0, // 6
  0xF0, 0x10, 0x20, 0x40, 0x40, // 7
  0xF0, 0x90, 0xF0, 0x90, 0xF0, // 8
  0xF0, 0x90, 0xF0, 0x10, 0xF0, // 9
  0xF0, 0x90, 0xF0, 0x90, 0x90, // A
  0xE0, 0x90, 0xE0, 0x90, 0xE0, // B
  0xF0, 0x80, 0x80, 0x80, 0xF0, // C
  0xE0, 0x90, 0x90, 0x90, 0xE0, // D
  0xF0, 0x80, 0xF0, 0x80, 0xF0, // E
  0xF0, 0x80, 0xF0, 0x80, 0x80 // F
];

/*
 * Integer number of bytes for each character in FONT.
 */
const FONT_SIZE = FONT.length / 16;

/*
 * Class to help parse the 2 bytes long opcode.
 */
class Opcode {
  constructor(word) {
    if (typeof word !== 'number') {
      throw new TypeError('word must be a number.');
    }

    // Restrict word to the lower 2 bytes
    this.word = word & 0xFFFF;
  }

  get a() {
    return ((this.word & 0xF000) >> 12);
  }

  get n() {
    return (this.word & 0x000F);
  }

  get nn() {
    return (this.word & 0x00FF);
  }

  get nnn() {
    return (this.word & 0x0FFF);
  }

  get x() {
    return ((this.word & 0x0F00) >> 8);
  }

  get y() {
    return ((this.word & 0x00F0) >> 4);
  }
}

/*
 * Return a random integer N such that min <= N < max.
 */
function getRandomInteger(min, max) {
  min = Math.ceil(min);
  max = Math.floor(max);
  return Math.floor((Math.random() * (max - min)) + min);
}

/*
 * JavaScript CHIP-8 emulator
 */
class Emulator {
  constructor() {
    this.memory = new Uint8Array(RAM_SIZE);
    this.programCounter = START_ADDRESS;

    // Data registers
    this.register = new Uint8Array(REGISTER_COUNT);

    // Address register
    this.address = 0;

    // Timers
    this.delayTimer = 0;
    this.soundTimer = 0;

    this.keys = new Set();
    this.stack = [];
    this.frameBuffer = [];
    for (let x = 0; x < DISPLAY_WIDTH; x++) {
      this.frameBuffer.push((new Array(DISPLAY_HEIGHT)).fill(false));
    }

    this.operationMap = new Map([
      [0x0, new Map([
        [0x0, this.clear.bind(this)],
        [0xE, this.functionReturn.bind(this)]])],
      [0x1, this.goto.bind(this)],
      [0x2, this.call.bind(this)],
      [0x3, this.skipEqual.bind(this)],
      [0x4, this.skipNotEqual.bind(this)],
      [0x5, this.skipXYEqual.bind(this)],
      [0x6, this.setX.bind(this)],
      [0x7, this.addToX.bind(this)],
      [0x8, new Map([
        [0x0, this.setXToY.bind(this)],
        [0x1, this.bitwiseOr.bind(this)],
        [0x2, this.bitwiseAnd.bind(this)],
        [0x3, this.bitwiseXor.bind(this)],
        [0x4, this.addYToX.bind(this)],
        [0x5, this.subtractYFromX.bind(this)],
        [0x6, this.shiftRight.bind(this)],
        [0x7, this.subtractXFromY.bind(this)],
        [0xE, this.shiftLeft.bind(this)]])],
      [0x9, this.skipXYNotEqual.bind(this)],
      [0xA, this.setAddress.bind(this)],
      [0xB, this.jump.bind(this)],
      [0xC, this.random.bind(this)],
      [0xD, this.draw.bind(this)],
      [0xE, new Map([
        [0x9E, this.skipKey.bind(this)],
        [0xA1, this.skipNotKey.bind(this)]])],
      [0xF, new Map([
        [0x07, this.setXToDelay.bind(this)],
        [0x0A, this.wait.bind(this)],
        [0x15, this.setDelay.bind(this)],
        [0x18, this.setSound.bind(this)],
        [0x1E, this.addXToI.bind(this)],
        [0x29, this.getFont.bind(this)],
        [0x33, this.bcd.bind(this)],
        [0x55, this.dumpRegister.bind(this)],
        [0x65, this.loadRegister.bind(this)]])]
    ]);

    this.load(FONT);
  }

  /*
   * Load the bytes in bytes into memory starting at start.
   */
  load(bytes, start = 0) {
    if (typeof start !== 'number') {
      throw new TypeError('start must be a non-negative number.');
    }
    if (start < 0) {
      throw new RangeError('start must be a non-negative number.');
    }

    let limit = Math.min(bytes.length, this.memory.length - start);
    for (let i = 0; i < limit; i++) {
      this.memory[start+i] = bytes[i] & 0xFF;
    }
  }

  /*
   * Increment the program counter by an opcode.
   */
  advanceProgramCounter() {
    this.programCounter += OPCODE_SIZE;
    if (this.programCounter >= this.memory.length) {
      this.programCounter -= OPCODE_SIZE;
      throw new RangeError('Memory exceeded!');
    }
  }

  /*
   * Emulate the run of one CPU cycle.
   */
  emulateCycle() {
    let opcode = this.getOpcode(),
        operation = this.getOperation(opcode);
    this.advanceProgramCounter();
    if (typeof operation === 'function') {
      operation(opcode);
    }
  }

  /*
   * Decrement positive timers by 1.
   */
  decrementTimers() {
    if (this.delayTimer > 0) {
      this.delayTimer--;
    }
    if (this.soundTimer > 0) {
      this.soundTimer--;
    }
  }

  /*
   * Return the 2 bytes long opcode currently pointed to by the program counter.
   *
   * Note: This method DOES NOT advance the program counter!
   */
  getOpcode() {
    return new Opcode((this.memory[this.programCounter] << 8) | this.memory[this.programCounter+1]);
  }

  getOperation(opcode) {
    let operation = this.operationMap.get(opcode.a);
    if (operation == null) {
      throw new RangeError('Invalid opcode ${ opcode.word.toString(16) }!');
    }

    if (typeof operation === 'function') {
      return operation;
    }

    console.assert(operation instanceof Map, 'Further lookup is needed.');

    if (opcode.a > 0xD) {
      return operation.get(opcode.nn);
    }
    else {
      return operation.get(opcode.n);
    }
  }


  /*
   * Operations
   */

  /*
   * Clears the screen.
   */
  clear(opcode) {
    for (let column of this.frameBuffer) {
      column.fill(false);
    }
  }

  /*
   * Returns from a subroutine.
   */
  functionReturn(opcode) {
    if (this.stack.length > 0) {
      this.programCounter = this.stack.pop();
    }
  }

  /*
   * Jumps to address NNN.
   */
  goto(opcode) {
    this.programCounter = opcode.nnn;
  }

  /*
   * Calls subroutine at NNN.
   */
  call(opcode) {
    this.stack.push(this.programCounter);
    this.goto(opcode);
  }

  /*
   * Skips the next instruction if VX equals NN.
   */
  skipEqual(opcode) {
    if (this.register[opcode.x] === opcode.nn) {
      this.advanceProgramCounter();
    }
  }

  /*
   * Skips the next instruction if VX does not equal NN.
   */
  skipNotEqual(opcode) {
    if (this.register[opcode.x] !== opcode.nn) {
      this.advanceProgramCounter();
    }
  }

  /*
   * Skips the next instruction if VX equals VY.
   */
  skipXYEqual(opcode) {
    if (this.register[opcode.x] === this.register[opcode.y]) {
      this.advanceProgramCounter();
    }
  }

  /*
   * Sets VX to NN.
   */
  setX(opcode) {
    this.register[opcode.x] = opcode.nn;
  }

  /*
   * Adds NN to VX.
   */
  addToX(opcode) {
    this.register[opcode.x] += opcode.nn;
    // Restrict the value in case of overflow
    this.register[opcode.x] &= 0xFF;
  }

  /*
   * Sets VX to VY.
   */
  setXToY(opcode) {
    this.register[opcode.x] = this.register[opcode.y];
  }

  /*
   * Sets VX to VX | VY.
   */
  bitwiseOr(opcode) {
    this.register[opcode.x] = this.register[opcode.x] | this.register[opcode.y];
  }

  /*
   * Sets VX to VX & VY.
   */
  bitwiseAnd(opcode) {
    this.register[opcode.x] = this.register[opcode.x] & this.register[opcode.y];
  }

  /*
   * Sets VX to VX ^ VY.
   */
  bitwiseXor(opcode) {
    this.register[opcode.x] = this.register[opcode.x] ^ this.register[opcode.y];
  }

  /*
   * Adds VY to VX. VF is set to 1 when there's a carry and to 0 when there is not.
   */
  addYToX(opcode) {
    let original = this.register[opcode.x];
    this.register[opcode.x] += this.register[opcode.y];
    // Restrict the value in case of overflow
    this.register[opcode.x] &= 0xFF;

    if (this.register[opcode.x] < original) {
      this.register[0xF] = 1;
    }
    else {
      this.register[0xF] = 0;
    }
  }

  /*
   * Subtracts VY from VX. VF is set to 0 when there's a borrow and to 1 when there is not.
   */
  subtractYFromX(opcode) {
    let original = this.register[opcode.x];
    this.register[opcode.x] -= this.register[opcode.y];
    // Restrict the value in case of overflow
    this.register[opcode.x] &= 0xFF;

    if (this.register[opcode.x] > original) {
      this.register[0xF] = 0;
    }
    else {
      this.register[0xF] = 1;
    }
  }

  /*
   * Stores the least significant bit of VX in VF and then shifts VX to the right by 1.
   *
   * Note: This is considered incorrect behavior.
   */
  shiftRight(opcode) {
    this.register[0xF] = this.register[opcode.x] & 0x01;
    this.register[opcode.x] = this.register[opcode.x] >> 1;
  }

  /*
   * Sets VX to VY - VX. VF is set to 0 when there's a borrow and to 1 when there is not.
   */
  subtractXFromY(opcode) {
    let original = this.register[opcode.y];
    this.register[opcode.x] = this.register[opcode.y] - this.register[opcode.x];
    // Restrict the value in case of overflow
    this.register[opcode.x] &= 0xFF;

    if (this.register[opcode.x] > original) {
      this.register[0xF] = 0;
    }
    else {
      this.register[0xF] = 1;
    }
  }

  /*
   * Stores the most significant bit of VX in VF and then shifts VX to the left by 1.
   *
   * Note: This is considered incorrect behavior.
   */
  shiftLeft(opcode) {
    this.register[0xF] = this.register[opcode.x] >> 7;
    this.register[opcode.x] = (this.register[opcode.x] << 1) & 0xFF;
  }

  /*
   * Skips the next instruction if VX does not equal VY.
   */
  skipXYNotEqual(opcode) {
    if (this.register[opcode.x] !== this.register[opcode.y]) {
      this.advanceProgramCounter();
    }
  }

  /*
   * Sets the address register to NNN.
   */
  setAddress(opcode) {
    this.address = opcode.nnn;
  }

  /*
   * Jumps to the address NNN + V0.
   */
  jump(opcode) {
    this.programCounter = (this.register[0] + opcode.nnn) & 0xFFF;
  }

  /*
   * Sets VX to the result of a bitwise and between a random number and NN.
   */
  random(opcode) {
    this.register[opcode.x] = getRandomInteger(0, 256) & opcode.nn;
  }

  /*
   * Draws a 8 pixel by N pixel sprite at (VX, VY).
   */
  draw(opcode) {
    let x = this.register[opcode.x],
        y = this.register[opcode.y],
        n = opcode.n,
        row, pixels, mask, column, oldBit, newBit;

    this.register[0xF] = 0;
    for (let i = 0; i < n; i++) {
      // y coordinate greater than DISPLAY_HEIGHT is reduced modulo DISPLAY_HEIGHT
      row = (y + i) % DISPLAY_HEIGHT;
      pixels = this.memory[this.address+i];

      for (let offset = 0; offset < 8; offset++) {
        mask = 0x80 >> offset;
        // x coordinate greater than DISPLAY_WIDTH is reduced modulo DISPLAY_WIDTH
        column = (x + offset) % DISPLAY_WIDTH;
        oldBit = this.frameBuffer[column][row] ? 1 : 0;
        newBit = ((pixels & mask) > 0) ? 1 : 0;
        this.frameBuffer[column][row] = (oldBit ^ newBit) > 0;

        if ((oldBit === 1) && (newBit === 0)) {
          this.register[0xF] = 1;
        }
      }
    }
  }

  /*
   * Skips the next instruction if the key stored in VX is pressed.
   */
  skipKey(opcode) {
    if (this.keys.has(this.register[opcode.x])) {
      this.advanceProgramCounter();
    }
  }

  /*
   * Skips the next instruction if the key stored in VX is not pressed.
   */
  skipNotKey(opcode) {
    if (!this.keys.has(this.register[opcode.x])) {
      this.advanceProgramCounter();
    }
  }

  /*
   * Sets VX to the value of the delay timer.
   */
  setXToDelay(opcode) {
    this.register[opcode.x] = this.delayTimer;
  }

  /*
   * Wait for a key press and store it in VX.
   */
  wait(opcode) {
    if (this.keys.size <= 0) {
      // Block on this opcode until a key is pressed
      this.programCounter -= OPCODE_SIZE;
    }
    else {
      this.register[opcode.x] = Array.from(this.keys)[0];
    }
  }

  /*
   * Sets the delay timer to VX.
   */
  setDelay(opcode) {
    this.delayTimer = this.register[opcode.x];
  }

  /*
   * Sets the sound timer to VX.
   */
  setSound(opcode) {
    this.soundTimer = this.register[opcode.x];
    if (this.soundTimer > 0) {
      // Timers count down at 60 hertz so the beep runs for VX / 60 seconds
      tone.play('A4', this.soundTimer / 60);
    }
  }

  /*
   * Adds VX to I.
   */
  addXToI(opcode) {
    this.address = this.address + this.register[opcode.x];
    // Restrict the value in case of overflow
    // Even though the address register is 16 bits wide, it should only have 12 bit addresses
    this.address &= 0xFFF;
  }

  /*
   * Sets I to the address of the sprite for the character in VX.
   */
  getFont(opcode) {
    this.address = this.register[opcode.x] * FONT_SIZE;
    // Restrict the value in case of overflow
    // Even though the address register is 16 bits wide, it should only have 12 bit addresses
    this.address &= 0xFFF;
  }

  /*
   * Stores the binary-coded decimal representation of VX at I, I + 1, and I + 2.
   */
  bcd(opcode) {
    let value = this.register[opcode.x];
    this.memory[this.address] = Math.trunc(value / 100) & 0xFF;
    this.memory[this.address+1] = Math.trunc((value / 10) % 10) & 0xFF;
    this.memory[this.address+2] = Math.trunc(value % 10) & 0xFF;
  }

  /*
   * Stores the registers V0 to VX in memory starting at I.
   */
  dumpRegister(opcode) {
    for (let i = 0; i <= opcode.x; i++) {
      if ((this.address + i) >= this.memory.length) {
        break;
      }
      this.memory[this.address+i] = this.register[i];
    }
  }

  /*
   * Loads the registers V0 to VX from memory starting at I.
   */
  loadRegister(opcode) {
    for (let i = 0; i <= opcode.x; i++) {
      if ((this.address + i) >= this.memory.length) {
        break;
      }
      this.register[i] = this.memory[this.address+i];
    }
  }
}
