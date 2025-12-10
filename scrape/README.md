# SBP Circular Scraper Usage

This script scrapes circulars from the State Bank of Pakistan (SBP) website. It supports scraping metadata, full HTML content, and PDF attachments.

## 🚀 How to Run

### 1. Basic Scraping (Metadata Only)
Extracts titles, dates, numbers, and links. Fastest option.
```bash
python enhanced_selectors_structure_aware.py
```
*Output:* `[dept]_results_structure_aware.json`

### 2. Extract Circular Content
Also visits each circular's page and extracts the text content (preambles, guidelines, tables).
```bash
python enhanced_selectors_structure_aware.py --extract-circular
```
*Output:* `[dept]_results_with_circular_content.json`

### 3. Extract PDF Content
Downloads and extracts text from attached PDF files (slowest).
```bash
python enhanced_selectors_structure_aware.py --extract-pdf
```
*Output:* `[dept]_results_with_pdf_content.json`

### 4. Full Extraction (All Content)
Extracts everything: Metadata + HTML Page Content + PDF Text.
```bash
python enhanced_selectors_structure_aware.py --extract-circular --extract-pdf
```
*Output:* `[dept]_results_with_pdf_circular_content.json`

---

## ⚙️ Configuration

To limit the number of years scraped (e.g., to test quickly), edit `enhanced_selectors_structure_aware.py` around **line 1530**:

```python
# Process most recent 2 years
dept_data = scraper.process_department(dept_name, dept_url, max_years=2)

# Process ALL years
dept_data = scraper.process_department(dept_name, dept_url, max_years=None)
```
