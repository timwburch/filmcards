# filmcards
A simple site to create Film Cards to print in Index card

## Movie lookup

The **Add Movie/Show** dialog can search either:

- IMDb records through an [OMDb API key](https://www.omdbapi.com/apikey.aspx)
- [The Movie Database](https://www.themoviedb.org/settings/api) with a TMDB read access token

Enter the credential for the selected provider in the dialog. Credentials, film details, and downloaded stills are stored only in the current browser. TMDB results use a backdrop image when one is available; OMDb results use the IMDb poster supplied by that service.

## Still search

Use **Search for a still** in any card's photo well to open an image search for its current title. Copy an image address from a result, paste it into the dialog, preview it, and select **Use this still**. The chosen image is saved with that card in the browser when the image host permits downloading; otherwise its remote URL is retained.
