const io = require('socket.io-client');

// Test the queue system
const socket1 = io('http://localhost:8080');
const socket2 = io('http://localhost:8080');
const socket3 = io('http://localhost:8080');
const socket4 = io('http://localhost:8080');
const socket5 = io('http://localhost:8080');

let connectedCount = 0;

function onConnect(socket, name) {
  console.log(`${name} connected`);
  connectedCount++;
  
  if (connectedCount === 5) {
    console.log('All sockets connected, testing queue...');
    
    // Join queue with all sockets
    setTimeout(() => {
      console.log('Socket 1 joining queue...');
      socket1.emit('action', { type: 'lobby/client-join-queue' });
    }, 1000);
    
    setTimeout(() => {
      console.log('Socket 2 joining queue...');
      socket2.emit('action', { type: 'lobby/client-join-queue' });
    }, 1500);
    
    setTimeout(() => {
      console.log('Socket 3 joining queue...');
      socket3.emit('action', { type: 'lobby/client-join-queue' });
    }, 2000);
    
    setTimeout(() => {
      console.log('Socket 4 joining queue...');
      socket4.emit('action', { type: 'lobby/client-join-queue' });
    }, 2500);
    
    setTimeout(() => {
      console.log('Socket 5 joining queue...');
      socket5.emit('action', { type: 'lobby/client-join-queue' });
    }, 3000);
  }
}

socket1.on('connect', () => onConnect(socket1, 'Socket 1'));
socket2.on('connect', () => onConnect(socket2, 'Socket 2'));
socket3.on('connect', () => onConnect(socket3, 'Socket 3'));
socket4.on('connect', () => onConnect(socket4, 'Socket 4'));
socket5.on('connect', () => onConnect(socket5, 'Socket 5'));

// Listen for actions
function setupActionListener(socket, name) {
  socket.on('action', (action) => {
    console.log(`${name} received action:`, action.type);
    if (action.type === 'lobby/update-queue-state') {
      console.log(`${name} queue state:`, action.payload);
    }
    if (action.type === 'lobby/update-game-state' && action.payload.inGame) {
      console.log(`${name} game started!`);
    }
  });
}

setupActionListener(socket1, 'Socket 1');
setupActionListener(socket2, 'Socket 2');
setupActionListener(socket3, 'Socket 3');
setupActionListener(socket4, 'Socket 4');
setupActionListener(socket5, 'Socket 5');

// Cleanup after 30 seconds
setTimeout(() => {
  console.log('Test completed, disconnecting...');
  socket1.disconnect();
  socket2.disconnect();
  socket3.disconnect();
  socket4.disconnect();
  socket5.disconnect();
  process.exit(0);
}, 30000);

