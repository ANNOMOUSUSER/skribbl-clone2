🎨 Skribbl.io Clone

A real-time multiplayer drawing and guessing game built with Node.js, Socket.io, and HTML5 Canvas. Players take turns drawing while others try to guess the word!

 ✨ Features

 🎮 Game Features
- Real-time multiplayer gameplay with Socket.io
- HTML5 Canvas drawing with multiple colors and brush sizes
- Turn-based rounds where players alternate between drawing and guessing
- Live chat system for guesses and communication
- Scoring system with points for correct guesses
- Customizable game settings (rounds, time limits)
- Room-based gameplay with shareable room codes

 👑 Admin Features
- Admin panel for game management
- Spectator mode with live canvas viewing
- Player management (kick players, view scores)
- Game controls (start/end games, skip turns)
- Real-time monitoring of all game activities

📱 Technical Features
- Responsive design for desktop and mobile
- Touch support for mobile drawing
- Real-time synchronization of drawing data
- Error handling and connection management
- Lobby system with room joining

 🚀 Installation

Prerequisites
- Node.js (v14 or higher)
- npm or yarn

Setup
1. Clone the repository
   ```bash
   git clone 
   cd skribbl-clone
   ```

2. Install dependencies
   ```bash
   npm install
   ```

3. Start the server
   ```bash
   npm start
   # or
   node server.js
   ```

4. **Open your browser**
   - Players: `http://localhost:3000`
   - Admin Panel: `http://localhost:3000/admin`

🎯 How to Play

For Players
1. Join a Game
   - Enter your username
   - Enter a room code or create a new room
   - Wait for other players to join

2. Drawing Turn
   - When it's your turn, you'll receive a word to draw
   - Use the drawing tools (colors, brush sizes)
   - Draw the word without using letters or numbers
   - Clear canvas if needed

3. Guessing Turn
   - Watch other players draw
   - Type your guesses in the chat
   - Earn points for correct guesses
   - The faster you guess, the more points you get!

 For Admins
1. Access Admin Panel
   - Go to `/admin` route
   - Enter admin username
   - Create or join a room as admin

2. Manage Games
   - Monitor all player activities
   - Start/end games manually
   - Skip turns if needed
   - Kick problematic players
   - View live drawing canvas

 📁 Project Structure

```
skribbl-clone/
├── public/
│   ├── index.html          # Main player interface
│   ├── admin.html          # Admin panel interface
│   └── styles.css          # Styling (if separate)
├── server.js               # Node.js server with Socket.io
├── package.json            # Dependencies and scripts
└── README.md              # This file
```

🔧 Configuration

 Game Settings
- Max Rounds: Number of drawing rounds (default: 3)
- Round Time: Time limit per round in seconds (default: 60)
- Total Time: Overall game time limit (default: 300)
 Server Configuration
- Port: Server port (default: 3000)
- Socket.io: Real-time communication
- Static Files: Served from public directory

 🌐 Socket Events

Client to Server
- `createRoom` - Create a new game room
- `joinRoom` - Join existing room
- `drawingData` - Send drawing coordinates
- `clearCanvas` - Clear the drawing canvas
- `chatMessage` - Send chat message
- `startGame` - Start the game (admin)
- `adminSkipTurn` - Skip current turn (admin)
- `adminEndGame` - End current game (admin)
- `adminKickPlayer` - Kick a player (admin)

 Server to Client
- `roomCreated` - Room creation confirmation
- `roomJoined` - Room join confirmation
- `playersUpdate` - Updated player list
- `roundStart` - New round started
- `drawingData` - Receive drawing data
- `clearCanvas` - Canvas cleared
- `chatMessage` - New chat message
- `correctGuess` - Correct guess made
- `roundEnd` - Round ended
- `gameEnd` - Game finished
- `timeUpdate` - Timer update

🎨 Canvas Features

Drawing Tools
- Color Palette: 8 preset colors (black, red, green, blue, yellow, magenta, cyan, orange)
- Brush Sizes: Adjustable from 1-20 pixels
- Clear Function: Reset the entire canvas
- Smooth Drawing: Round line caps and joins

 Technical Implementation
- HTML5 Canvas for drawing surface
- Mouse Events for desktop drawing
- Touch Events for mobile support
- Real-time Sync via Socket.io
- Spectator Mode for non-drawing players

🛠️ Development

### Adding New Features
1. Server-side: Add socket event handlers in `server.js`
2. Client-side: Add corresponding event listeners in HTML files
3. UI Updates: Modify HTML/CSS for new interface elements

 Debugging
- Enable console logging for socket events
- Check browser developer tools for errors
- Monitor server console for connection issues

🚀 Deployment

 Local Deployment
- Ensure all dependencies are installed
- Configure port in server.js if needed
- Start with `node server.js`

Production Deployment
- Set appropriate environment variables
- Configure reverse proxy if needed
- Ensure Socket.io works with your hosting provider

🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

 📝 License

This project is open source. Feel free to use, modify, and distribute as needed.

🐛 Troubleshooting


 Support
- Check browser console for JavaScript errors
- Verify Socket.io connection status
- Ensure server is running and accessible

Enjoy your drawing and guessing game! 🎨✨
