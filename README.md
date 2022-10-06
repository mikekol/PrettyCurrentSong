# PrettyCurrentSong
PrettyCurrentSong is a small, stylable web app that will display information about the current song playing on your Spotify player.

To configure the application to work with your personal Spotify account:

Change line 137 (or thereabouts) in main.js to your own Spofity client ID. To get your own ID, follow the Getting Started guide here: https://developer.spotify.com/documentation/web-api/quick-start/ (up until Preparing Your Environments).

Use the run_pcs.cmd or run_pcs.sh scripts (Windows and Mac/Linux, respectively) to launch the server.

Launch Spotify and start playing something.

Add a Browser Source to your OBS scene, and set the URL to http://localhost:8888.
I use a height of 75 and a width of 700, but you do you.  I recommend checking "Shutdown source when not visible" and "Refresh browser when scene becomes active". Initially, you may want to set the height to be bigger because of the next step.

Once you add it (and have the server running!), click the Interact button in OBS. This should open the app in an interactive window, and it should prompt you to sign into Spotify, and authorize the application to access your account. You are only giving the application the permission to read about your current player, and what media it's playing - it is read-only: this app does not and cannot modify any of your account information.

Once you're logged in, you should see the currently playing song.  Resize the control however you want now.

The refresh rate is set to 10 seconds, so there could be up to a 10-second delay in picking up a song change or pause/play state change.