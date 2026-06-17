# InfraCo OS — demo prototypes

> **These are standalone HTML prototypes with sample data, built for
> board/investor presentation.** They are **not** the application and are
> **not** wired to the API, database, or auth. Everything you click is canned
> sample data baked into the file.
>
> Real estate-data seeding — e.g. **Tynwald (SD/WR/13/24)** and
> **Kwekwe (SR195/1999)** — is a **separate, planned task** against the actual
> platform. These prototypes do not reflect that data.

## Files

### `infraco-os-demo-v3.html` — full platform clickable demo
The complete operator-facing platform walkthrough:
- Login screen
- Site map with **Kwekwe + Tynwald** estates (sample data — title-secured
  plots with power, water and fibre)
- All role views (operations, arrears management, board, etc.)
- SMS centre
- Board view

### `infraco-superapp-phone.html` — resident Super-App
Phone-optimised resident experience (the consumer-facing "Super-App"), sized
for a mobile screen for handing a phone to a viewer during a demo.

## How to share for a demo

Both files are fully self-contained — **once a file loads in the browser it
works entirely offline** (no server, no network calls). To share a link:

1. **Host the HTML file** somewhere public:
   - **GitHub Pages** — push the file to a repo/branch with Pages enabled; the
     URL is `https://<user>.github.io/<repo>/infraco-os-demo-v3.html`.
   - **Netlify Drop** — drag the file (or this `demo/` folder) onto
     <https://app.netlify.com/drop> for an instant public URL, no account
     needed.
2. **Generate a QR code** pointing at that URL (e.g. any QR generator) so
   viewers can open it on their own phones — ideal for the resident Super-App.
3. Share the link/QR. After first load it stays usable offline, so a flaky
   venue connection won't break the presentation.
