# SBP Circulars Nested Structure Visualizer

A web-based UI for visualizing deeply nested State Bank of Pakistan (SBP) regulatory circulars and PDFs.

## Overview

This application provides an intuitive interface to explore SBP circulars, circular letters, and PDF documents with their references in a hierarchical tree structure. The data is sourced from JSON files containing regulatory documents extracted from the SBP website.

## Features

- **Tree Sidebar Navigation**: Hierarchical tree view of all documents organized by year
- **Nested References**: Expand/collapse tree nodes to view referenced documents up to 5 levels deep
- **Content Rendering**: Display document content including text, lists, tables, and hierarchical structures
- **Filtering**: Filter by department (ACD/BPRD), year, and search keywords
- **Reference Navigation**: Click on references to navigate between related documents
- **Clean UI**: Minimalist design focused on readability and usability

## Getting Started

### Prerequisites

- Python 3.x (for running a local HTTP server)
- Modern web browser (Chrome, Firefox, Safari, or Edge)
- JSON data files in the parent directory:
  - `acd_results_with_pdf_circular_content.json`
  - `bprd_results_with_pdf_circular_content.json`

### Running the Application

1. Navigate to the fypscraper directory:
   ```bash
   cd /path/to/fypscraper
   ```

2. Start a local HTTP server:
   ```bash
   python3 -m http.server 8000
   ```

3. Open your web browser and navigate to:
   ```
   http://localhost:8000/ui/index.html
   ```

4. Wait for the data to load (may take a few seconds for large datasets)

## Usage

### Filtering Documents

- **Department Filter**: Select "All Departments", "ACD", or "BPRD" to filter documents by department
- **Year Filter**: Select "All Years" or a specific year to filter documents by publication year
- **Search Box**: Enter keywords to search across document titles, IDs, and dates

### Navigating the Tree

- **Expand/Collapse**: Click the ▶ or ▼ icon to show/hide nested references
- **Select Document**: Click on a document title to view its full content in the right pane
- **Tree Organization**: Documents are grouped by year with document counts displayed

### Viewing Document Content

- **Content Area**: The right pane displays the selected document's full content
- **Content Types**: Supports plain text, lists, tables, and hierarchical content structures
- **Referenced Documents**: Scroll to the bottom to see a list of referenced documents
- **Navigate References**: Click on any reference to view that document's content

### Understanding Icons

- 📄 **Circular/Circular Letter**: Represents a circular or circular letter document
- 📕 **PDF Document**: Represents a PDF attachment with extracted content

### Visual Hierarchy

- **Indentation**: Nested references are indented 20px per level
- **Selection**: Selected documents are highlighted with a gray background and bold text
- **Hover Effects**: Tree nodes and reference items highlight on hover for better visibility

## Data Structure

The application reads JSON files with the following structure:

```json
{
  "department": "ACD",
  "years": {
    "2020": {
      "circulars": [...],
      "circular_letters": [
        {
          "title": "Document Title",
          "ID": "ACD Circular Letter No. 06 of 2020",
          "date": "July 13, 2020",
          "url": "http://www.sbp.org.pk/...",
          "content": [
            { "type": "content", "text": "..." },
            { "type": "list", "items": [...] },
            { "type": "table", "headers": [...], "rows": [...] }
          ],
          "references": [
            {
              "type": "circular",
              "title": "Referenced Circular",
              "url": "https://...",
              "content": {
                "content": [...],
                "references": [...]
              }
            }
          ]
        }
      ]
    }
  }
}
```

## Technical Details

### Technology Stack

- **Frontend Framework**: Vue.js 3 (CDN-based, no build step required)
- **Architecture**: Single-page application with recursive tree component
- **Styling**: Custom CSS with responsive layout
- **Data Format**: JSON files served statically

### File Structure

```
fypscraper/
├── ui/
│   ├── index.html          # Main application file
│   └── README.md           # This file
├── acd_results_with_pdf_circular_content.json
└── bprd_results_with_pdf_circular_content.json
```

### Component Architecture

- **App Component**: Manages application state, data loading, filtering, and document selection
- **TreeNode Component**: Recursive component that renders tree nodes and their nested references

### Performance Considerations

- Large datasets (BPRD: 14MB) may take 5-10 seconds to load
- Tree rendering is optimized with Vue's reactive system
- Maximum nesting depth limited to 5 levels to prevent performance issues

## Troubleshooting

### Data Not Loading

**Error**: "Error loading data. Please ensure JSON files are accessible."

**Solutions**:
- Verify JSON files exist in the parent directory (fypscraper/)
- Ensure you're running the application through an HTTP server (not file:// protocol)
- Check browser console for detailed error messages
- Verify JSON files are not corrupted

### No Documents Found

**Possible Causes**:
- Filters are too restrictive (try selecting "All Departments" and "All Years")
- Search query doesn't match any documents
- JSON files don't contain data for the selected criteria

### Slow Loading

**Expected Behavior**:
- ACD data (~2.3MB): Loads in 1-2 seconds
- BPRD data (~14MB): May take 5-10 seconds
- Large datasets are normal and handled by the browser

### Tree Not Expanding

**Possible Causes**:
- Document has no references (no expand icon will appear)
- Maximum nesting depth (5 levels) reached
- JavaScript error (check browser console)

## Browser Compatibility

Tested and compatible with:
- Chrome 90+
- Firefox 88+
- Safari 14+
- Edge 90+

## Known Limitations

1. Maximum nesting depth limited to 5 levels (as per data structure)
2. Large datasets may take time to load initially
3. No backend required (static file serving only)
4. Reference documents without extracted content will show "No content available"

## Future Enhancements

Potential improvements for future versions:
- Virtual scrolling for very large document lists
- Export functionality (PDF, CSV)
- Advanced search with filters
- Bookmarking/favorites system
- Dark mode support
- Document comparison view

## License

This application is part of the fypscraper project for visualizing SBP regulatory documents.

## Support

For issues or questions:
1. Check this README for troubleshooting steps
2. Verify your setup matches the prerequisites
3. Check browser console for error messages
4. Ensure JSON data files are properly formatted
