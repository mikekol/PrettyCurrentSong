# PrettyCurrentSong

PrettyCurrentSong is a small, stylable web app that will display information about the current song playing on your Spotify player.

To configure the application to work with your personal Spotify account:

1. Change line 7 (or thereabouts) in main.js to your own Spotify client ID. To get your own ID, follow the Getting Started guide here: <https://developer.spotify.com/documentation/web-api/quick-start/> (up until Preparing Your Environments).

2. In your Spotify app dashboard, set the redirect URI to match how you plan to access the site:
   - If using `localhost`: `http://localhost:8889`
   - If using `127.0.0.1`: `http://127.0.0.1:8889`
   - You can add multiple redirect URIs to support both

3. Use the `run_pcs.cmd` or `run_pcs.sh` scripts (Windows and Mac/Linux, respectively) to launch the server.

4. Launch Spotify and start playing something.

5. Add a Browser Source to your OBS scene, and set the URL to `http://localhost:8889` (or `http://127.0.0.1:8889` if you prefer).
I use a height of 90 and a width of 700, but you do you.  I recommend checking "Shutdown source when not visible" and "Refresh browser when scene becomes active". Initially, you may want to set the height to be bigger because of the next step.

6. Once you add it (and have the server running!), click the Interact button in OBS. This should open the app in an interactive window, and it should prompt you to sign into Spotify, and authorize the application to access your account. You are only giving the application the permission to read about your current player, and what media it's playing - it is read-only: this app does not and cannot modify any of your account information.

7. Once you're logged in, you should see the currently playing song.  Resize the control however you want now.

The refresh rate is set to 10 seconds, so there could be up to a 10-second delay in picking up a song change or pause/play state change.

## Something doesn't look quite right

If you're using this in OBS (and you probably are), you'll need to add some custom CSS (as of OBS 30.0.2, OBS uses what is essentially Chrome v103 as the rendering engine for the Browser Source.  Some of the style units I used aren't supported by Chrome until v105, so we'll need to override some of the CSS styles to make it look as intended.  Please feel free to manipulate these values as necessary to make things look as you'd like.):

```css
.song-title {
    font-size: 25pt;
}
.artists {
    font-size: 15pt;
}
.cover-art {
    border-radius: 3%;
    padding: 1%;
    width: 75px;
}
```
