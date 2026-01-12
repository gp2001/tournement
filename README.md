# Tournament Stand ⚽

A modern, real-time tournament standings and statistics website with automatic data synchronization from Google Sheets.

## Features

- 📊 **Live Statistics** - Real-time tournament standings and match results
- ☁️ **Google Sheets Integration** - Automatic data loading from cloud
- 🎨 **Modern Design** - Beautiful gradients, animations, and responsive layout
- 📱 **Mobile Friendly** - Works perfectly on all devices
- ⚡ **Fast & Lightweight** - Pure JavaScript, no heavy frameworks

## Live Demo

Visit the live site: [Tournament Stand](https://gabriel.shamon.github.io/tournement)

## Tech Stack

- HTML5
- CSS3 (Modern gradients, animations, flexbox/grid)
- JavaScript (Vanilla JS)
- [SheetJS](https://sheetjs.com/) for Excel/Google Sheets parsing
- Google Sheets API for data source

## Setup

1. Clone the repository:
```bash
git clone https://github.com/YourUsername/tournement.git
cd tournement
```

2. Configure Google Sheets:
   - Upload your tournament Excel file to Google Sheets
   - File → Share → Publish to web
   - Format: "Microsoft Excel (.xlsx)"
   - Copy the URL and update `GOOGLE_SHEETS_URL` in `app.js`

3. Open `index.html` in your browser or deploy to GitHub Pages

## Google Sheets Setup

Your Google Sheets should have the following structure:

### Sheets:
- `GroupA` - Group A tournament data
- `GroupB` - Group B tournament data
- `GroupC` - Group C tournament data
- `Dames` - Women's tournament data

### Each sheet should contain:
- **Matches** (rows 12-17): Home team, Away team, Scores
- **Standings** (rows 13-17): Team names, GP, W, D, L, GF, GA, GD, PTS

## Deployment

### GitHub Pages:
1. Push code to GitHub
2. Go to repository Settings → Pages
3. Source: main branch
4. Your site will be live at: `https://gp2001.github.io/tournement`

## Configuration

Edit `app.js` to configure your data source:

```javascript
const GOOGLE_SHEETS_URL = 'YOUR_GOOGLE_SHEETS_EXPORT_URL';
```

## Features in Detail

### Automatic Updates
- Data loads automatically from Google Sheets
- No manual file uploads required
- Real-time synchronization

### Modern UI
- Smooth animations and transitions
- Gradient backgrounds
- Hover effects
- Responsive tables
- Mobile-optimized layout

### Statistics Display
- Team standings with full stats
- Match schedules and results
- Group-based navigation
- Visual highlights for top teams

## Browser Support

- ✅ Chrome (latest)
- ✅ Firefox (latest)
- ✅ Safari (latest)
- ✅ Edge (latest)
- ✅ Mobile browsers

## Credits

Made with ❤️ by [polezait.nl](https://polezait.nl)

## License

MIT License - feel free to use and modify for your tournaments!

## Support

For issues or questions, please open an issue on GitHub.

---

**Tournament Stand** - Making tournament statistics beautiful and accessible! 🏆⚽

