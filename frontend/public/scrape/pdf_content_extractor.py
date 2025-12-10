"""
Simple PDF Extractor - Standalone Version
A single-file PDF content extraction tool that processes documents page by page,
extracting text and tables with structured JSON output.

Usage:
    python pdf_extractor_standalone.py document.pdf
    python pdf_extractor_standalone.py document.pdf -o output_folder
    python pdf_extractor_standalone.py document.pdf -p 3
    python pdf_extractor_standalone.py document.pdf -s

Dependencies:
    pip install PyMuPDF pdfplumber pandas
"""

import fitz  # PyMuPDF
import pdfplumber
import json
import os
from pathlib import Path
from typing import Dict, List, Any, Optional
import logging
import requests
import io
import re
import time
from datetime import datetime

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)


class EnhancedPDFContentExtractor:
    """
    Enhanced PDF extractor that processes content page by page with support for both local files and URLs.
    Outputs structured JSON with text and table data using superior extraction algorithms.
    """
    
    def __init__(self, pdf_path: str = None, output_dir: str = None):
        """
        Initialize the PDF extractor.
        
        Args:
            pdf_path: Path to the PDF file (optional for URL-based processing)
            output_dir: Output directory (auto-generated if None)
        """
        self.logger = logger
        self.timeout = 60  # Default timeout for requests
        
        # User agent rotation for better reliability
        self.user_agents = [
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/92.0.4515.107 Safari/537.36',
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:90.0) Gecko/20100101 Firefox/90.0',
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:91.0) Gecko/20100101 Firefox/91.0',
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.1.1 Safari/605.1.15'
        ]
        
        # Initialize session for URL-based processing
        self.session = requests.Session()
        self._update_session_config()
        
        if pdf_path:
            if not os.path.exists(pdf_path):
                raise ValueError(f"PDF file does not exist: {pdf_path}")
            
            if not pdf_path.lower().endswith('.pdf'):
                raise ValueError(f"File must be a PDF: {pdf_path}")
            
            self.pdf_path = pdf_path
            self.pdf_name = Path(pdf_path).stem
            
            # Setup output directory
            if output_dir is None:
                output_dir = f"{self.pdf_name}_extracted"
            
            self.output_dir = output_dir
            Path(output_dir).mkdir(parents=True, exist_ok=True)
            
            logger.info(f"Initialized PDF extractor for: {pdf_path}")
        else:
            # URL-based mode
            self.pdf_path = None
            self.pdf_name = None
            self.output_dir = output_dir
    
    def _update_session_config(self):
        """Update session configuration with user agent."""
        # Use the first user agent (no rotation needed for simplified version)
        user_agent = self.user_agents[0]
        self.session.headers.update({
            'User-Agent': user_agent,
            'Accept': 'application/pdf,application/octet-stream,*/*',
            'Accept-Language': 'en-US,en;q=0.9',
            'Accept-Encoding': 'gzip, deflate, br',
            'Connection': 'keep-alive',
            'Upgrade-Insecure-Requests': '1'
        })
    

    
    def _extract_page_content(self, page_num: int, fitz_page, plumber_page) -> Dict[str, Any]:
        """
        Extract content from a single page.
        
        Args:
            page_num: Page number (1-indexed)
            fitz_page: PyMuPDF page object
            plumber_page: pdfplumber page object
            
        Returns:
            Dictionary with page content
        """
        page_content = {
            "page_number": page_num,
            "content": []
        }
        
        # Extract text content
        text_content = self._extract_text_content(fitz_page)
        if text_content:
            page_content["content"].append({
                "type": "text",
                "content": text_content
            })
        
        # Extract tables
        tables = self._extract_tables(plumber_page, page_num)
        for table in tables:
            page_content["content"].append({
                "type": "table",
                "content": table
            })
        
        return page_content
    
    def _extract_text_content(self, fitz_page) -> Optional[str]:
        """
        Extract and clean text content from a page.
        
        Args:
            fitz_page: PyMuPDF page object
            
        Returns:
            Cleaned text content or None if no text
        """
        try:
            # Extract text using PyMuPDF
            text = fitz_page.get_text()
            
            if not text or not text.strip():
                return None
            
            # Basic text cleaning
            lines = text.split('\n')
            cleaned_lines = []
            
            for line in lines:
                line = line.strip()
                if line:  # Skip empty lines
                    cleaned_lines.append(line)
            
            if not cleaned_lines:
                return None
            
            return '\n'.join(cleaned_lines)
            
        except Exception as e:
            logger.warning(f"Error extracting text: {e}")
            return None
    
    def _extract_tables(self, plumber_page, page_num: int) -> List[Dict[str, Any]]:
        """
        Extract and structure tables from a page.
        
        Args:
            plumber_page: pdfplumber page object
            page_num: Page number for identification
            
        Returns:
            List of structured table dictionaries
        """
        tables = []
        
        try:
            detected_tables = plumber_page.find_tables()
            
            for table_index, table in enumerate(detected_tables):
                table_data = table.extract()
                
                if table_data and self._is_valid_table(table_data):
                    structured_table = self._structure_table_data(
                        table_data, page_num, table_index + 1
                    )
                    
                    if structured_table:
                        tables.append(structured_table)
                        logger.debug(f"Extracted table {table_index + 1} from page {page_num}")
        
        except Exception as e:
            logger.warning(f"Error extracting tables from page {page_num}: {e}")
        
        return tables
    
    def _is_valid_table(self, table_data: List[List]) -> bool:
        """
        Check if extracted table data is valid.
        
        Args:
            table_data: Raw table data
            
        Returns:
            True if table is valid, False otherwise
        """
        if not table_data or len(table_data) < 2:
            return False
        
        # Check if table has at least 2 columns
        if not table_data[0] or len(table_data[0]) < 2:
            return False
        
        # Check if table has meaningful content (not all None/empty)
        non_empty_cells = 0
        total_cells = 0
        
        for row in table_data:
            for cell in row:
                total_cells += 1
                if cell and str(cell).strip():
                    non_empty_cells += 1
        
        # Require at least 30% non-empty cells
        if total_cells > 0 and (non_empty_cells / total_cells) >= 0.3:
            return True
        
        return False
    
    def _structure_table_data(self, table_data: List[List], page_num: int, table_num: int) -> Dict[str, Any]:
        """
        Structure table data into a standardized format with improved cleaning.
        
        Args:
            table_data: Raw table data
            page_num: Page number
            table_num: Table number on the page
            
        Returns:
            Structured table dictionary
        """
        try:
            # Clean the table data
            cleaned_data = []
            for row in table_data:
                cleaned_row = []
                for cell in row:
                    if cell is None:
                        cleaned_row.append("")
                    else:
                        cleaned_row.append(str(cell).strip())
                cleaned_data.append(cleaned_row)
            
            # Remove completely empty columns
            cleaned_data = self._remove_empty_columns(cleaned_data)
            
            if not cleaned_data or not cleaned_data[0]:
                return None
            
            # Remove mostly empty rows (keep rows with at least 1 meaningful cell)
            cleaned_data = self._remove_empty_rows(cleaned_data)
            
            if len(cleaned_data) < 1:
                return None
            
            # Determine if first row should be headers
            headers = None
            data_rows = cleaned_data
            
            if len(cleaned_data) > 1:
                first_row = cleaned_data[0]
                # Check if first row looks like headers (non-numeric, descriptive)
                if self._looks_like_headers(first_row):
                    headers = first_row
                    data_rows = cleaned_data[1:]
            
            # Create structured rows with column mapping
            structured_rows = []
            
            # Detect if this is a table of contents and provide meaningful column names
            is_toc = self._is_table_of_contents(cleaned_data)
            
            if headers and not is_toc:
                # Create dictionary-style rows with column names
                for row in data_rows:
                    row_dict = {}
                    for i, cell in enumerate(row):
                        if i < len(headers):
                            col_name = headers[i] if headers[i].strip() else f"column_{i+1}"
                            row_dict[col_name] = cell
                    if any(v.strip() for v in row_dict.values()):  # Only add non-empty rows
                        structured_rows.append(row_dict)
            else:
                # Use meaningful column names for table of contents or generic names
                if is_toc:
                    col_names = self._get_toc_column_names(len(cleaned_data[0]) if cleaned_data else 0)
                else:
                    col_names = [f"column_{i+1}" for i in range(len(cleaned_data[0]) if cleaned_data else 0)]
                
                # Use all data (including headers) for TOC
                rows_to_process = cleaned_data if is_toc else data_rows
                
                for row in rows_to_process:
                    row_dict = {}
                    for i, cell in enumerate(row):
                        if i < len(col_names):
                            row_dict[col_names[i]] = cell
                    if any(v.strip() for v in row_dict.values()):  # Only add non-empty rows
                        structured_rows.append(row_dict)
            
            structured_table = {
                "table_id": f"page_{page_num}_table_{table_num}",
                "page_number": page_num,
                "table_number": table_num,
                "headers": headers,
                "rows": structured_rows,
                "row_count": len(structured_rows),
                "column_count": len(headers) if headers else (len(cleaned_data[0]) if cleaned_data else 0)
            }
            
            return structured_table
            
        except Exception as e:
            logger.warning(f"Error structuring table data: {e}")
            return None
    
    def _remove_empty_columns(self, table_data: List[List]) -> List[List]:
        """
        Remove columns that are completely empty or contain only whitespace.
        
        Args:
            table_data: Raw table data
            
        Returns:
            Table data with empty columns removed
        """
        if not table_data or not table_data[0]:
            return table_data
        
        # Identify non-empty columns (require at least 20% of rows to have content)
        non_empty_cols = []
        col_count = len(table_data[0])
        row_count = len(table_data)
        
        for col_idx in range(col_count):
            content_count = 0
            for row in table_data:
                if col_idx < len(row) and row[col_idx] and str(row[col_idx]).strip():
                    content_count += 1
            
            # Keep column if it has content in at least 20% of rows
            if row_count > 0 and (content_count / row_count) >= 0.2:
                non_empty_cols.append(col_idx)
        
        # Create new table with only non-empty columns
        if not non_empty_cols:
            return []
        
        cleaned_table = []
        for row in table_data:
            cleaned_row = []
            for col_idx in non_empty_cols:
                if col_idx < len(row):
                    cleaned_row.append(row[col_idx])
                else:
                    cleaned_row.append("")
            cleaned_table.append(cleaned_row)
        
        return cleaned_table
    
    def _remove_empty_rows(self, table_data: List[List]) -> List[List]:
        """
        Remove rows that are completely empty or contain only whitespace.
        
        Args:
            table_data: Raw table data
            
        Returns:
            Table data with empty rows removed
        """
        if not table_data:
            return table_data
        
        cleaned_table = []
        for row in table_data:
            # Check if row has any meaningful content
            has_content = any(cell and str(cell).strip() for cell in row)
            if has_content:
                cleaned_table.append(row)
        
        return cleaned_table
    
    def _is_table_of_contents(self, table_data: List[List]) -> bool:
        """
        Detect if a table is a table of contents.
        
        Args:
            table_data: Cleaned table data
            
        Returns:
            True if this appears to be a table of contents
        """
        if not table_data or len(table_data) < 3:
            return False
        
        # Check for TOC indicators
        toc_indicators = 0
        total_cells = 0
        
        for row in table_data:
            for cell in row:
                if cell and str(cell).strip():
                    cell_upper = str(cell).strip().upper()
                    total_cells += 1
                    
                    # Look for TOC-specific terms
                    if any(term in cell_upper for term in [
                        'CONTENTS', 'PART', 'CHAPTER', 'SECTION', 'REGULATION',
                        'ANNEXURE', 'APPENDIX', 'PAGE NO', 'PAGE'
                    ]):
                        toc_indicators += 1
                    
                    # Look for regulation/section numbering patterns
                    if any(pattern in cell_upper for pattern in [
                        'REGULATION–', 'REGULATION-', 'PART A', 'PART B', 'PART C'
                    ]):
                        toc_indicators += 1
        
        # Consider it a TOC if we have enough indicators
        return total_cells > 0 and (toc_indicators / total_cells) >= 0.3
    
    def _get_toc_column_names(self, col_count: int) -> List[str]:
        """
        Generate meaningful column names for table of contents.
        
        Args:
            col_count: Number of columns
            
        Returns:
            List of column names
        """
        if col_count <= 0:
            return []
        elif col_count == 1:
            return ["item"]
        elif col_count == 2:
            return ["item", "page"]
        elif col_count == 3:
            return ["section", "title", "page"]
        elif col_count == 4:
            return ["section", "subsection", "title", "page"]
        else:
            # For more columns, use generic but meaningful names
            names = ["section", "subsection", "title"]
            for i in range(3, col_count - 1):
                names.append(f"detail_{i-2}")
            names.append("page")
            return names
    
    def _looks_like_headers(self, row: List[str]) -> bool:
        """
        Check if a row looks like table headers.
        
        Args:
            row: Row data to check
            
        Returns:
            True if row appears to be headers
        """
        if not row:
            return False
        
        # Count non-empty cells
        non_empty = [cell for cell in row if cell and str(cell).strip()]
        
        if len(non_empty) < 1:
            return False
        
        # Check for header-like characteristics
        header_indicators = 0
        numeric_count = 0
        
        for cell in non_empty:
            cell_str = str(cell).strip()
            cell_upper = cell_str.upper()
            
            # Common header words and patterns
            if any(word in cell_upper for word in [
                'NAME', 'TYPE', 'DATE', 'NUMBER', 'ID', 'DESCRIPTION', 
                'AMOUNT', 'STATUS', 'CATEGORY', 'TITLE', 'CODE', 'VALUE',
                'TOTAL', 'COUNT', 'PAGE', 'ITEM', 'DETAILS', 'CONTENTS',
                'REGULATION', 'PART', 'SECTION', 'CHAPTER', 'ANNEXURE'
            ]):
                header_indicators += 1
            
            # Check if it's purely numeric (less likely to be header)
            if cell_str.replace('.', '').replace('-', '').isdigit():
                numeric_count += 1
            
            # Check for title case or all caps (common in headers)
            if cell_str.istitle() or cell_str.isupper():
                header_indicators += 0.5
        
        # Avoid rows that are mostly numeric
        if len(non_empty) > 0 and (numeric_count / len(non_empty)) > 0.7:
            return False
        
        # Consider it headers if it has header-like characteristics
        return header_indicators >= 1
    
    def download_pdf_with_520_refresh(self, url: str) -> bytes:
        """
        Handle Cloudflare 520 errors with 5 refresh attempts at 5-second intervals.
        This mimics the manual refresh behavior that resolves 520 errors.
        
        Args:
            url: PDF URL to download
            
        Returns:
            PDF content as bytes or None if all refresh attempts fail
        """
        max_refresh_attempts = 25
        refresh_interval = 15  # 5 seconds between attempts
        
        for attempt in range(max_refresh_attempts):
            try:
                logger.info(f"🔄 Cloudflare 520 refresh attempt {attempt + 1}/{max_refresh_attempts} for: {url}")
                
                # Create a fresh session for each attempt (simulates browser refresh)
                fresh_session = requests.Session()
                fresh_session.headers.update(self.session.headers)
                
                # Add specific headers that help with Cloudflare
                fresh_session.headers.update({
                    'Cache-Control': 'no-cache, no-store, must-revalidate',
                    'Pragma': 'no-cache',
                    'Expires': '0',
                    'Accept': 'application/pdf,*/*',
                    'Accept-Language': 'en-US,en;q=0.9',
                    'Accept-Encoding': 'gzip, deflate, br',
                    'Connection': 'keep-alive',
                    'Upgrade-Insecure-Requests': '1',
                })
                
                response = fresh_session.get(
                    url, 
                    timeout=self.timeout,
                    stream=True,
                    allow_redirects=True
                )
                response.raise_for_status()
                
                # Download content in chunks
                content = b''
                for chunk in response.iter_content(chunk_size=8192):
                    if chunk:
                        content += chunk
                
                # Verify content type and PDF header
                content_type = response.headers.get('content-type', '').lower()
                if 'application/pdf' not in content_type and 'pdf' not in content_type:
                    if not content.startswith(b'%PDF'):
                        logger.warning(f"URL does not appear to be a PDF (content-type: {content_type}): {url}")
                        return None
                
                if not content.startswith(b'%PDF'):
                    logger.warning(f"Downloaded content is not a valid PDF: {url}")
                    return None
                    
                logger.info(f"✅ Successfully downloaded PDF after {attempt + 1} refresh attempts ({len(content)} bytes)")
                return content
                
            except requests.exceptions.HTTPError as e:
                if e.response.status_code == 520:
                    if attempt < max_refresh_attempts - 1:
                        logger.warning(f"🔄 Cloudflare 520 error on attempt {attempt + 1}. Refreshing in {refresh_interval} seconds...")
                        time.sleep(refresh_interval)
                        continue
                    else:
                        logger.error(f"❌ Cloudflare 520 error persists after {max_refresh_attempts} refresh attempts for: {url}")
                        return None
                else:
                    # For non-520 errors, don't continue refreshing
                    logger.error(f"❌ HTTP error {e.response.status_code} (not 520) for {url}: {str(e)}")
                    return None
                    
            except (requests.exceptions.ConnectionError, requests.exceptions.Timeout) as e:
                if attempt < max_refresh_attempts - 1:
                    logger.warning(f"🔄 Connection/timeout error on attempt {attempt + 1}. Refreshing in {refresh_interval} seconds...")
                    time.sleep(refresh_interval)
                    continue
                else:
                    logger.error(f"❌ Connection/timeout error persists after {max_refresh_attempts} refresh attempts: {str(e)}")
                    return None
                    
            except Exception as e:
                if attempt < max_refresh_attempts - 1:
                    logger.warning(f"🔄 Error on attempt {attempt + 1}: {str(e)}. Refreshing in {refresh_interval} seconds...")
                    time.sleep(refresh_interval)
                    continue
                else:
                    logger.error(f"❌ Error persists after {max_refresh_attempts} refresh attempts: {str(e)}")
                    return None
        
        return None
    

    
    def analyze_pdf_content(self, pdf_content: bytes) -> Dict[str, Any]:
        """Analyze PDF to determine content type and extractability."""
        analysis = {
            "has_images": False,
            "has_text": False,
            "text_extractable": False,
            "image_count": 0,
            "text_length": 0,
            "pages": 0
        }
        
        try:
            # Open PDF with PyMuPDF for analysis
            pdf_file = io.BytesIO(pdf_content)
            fitz_doc = fitz.open(stream=pdf_file, filetype="pdf")
            analysis["pages"] = len(fitz_doc)
            
            # Check for images and extract text
            total_text = ""
            for page_num in range(len(fitz_doc)):
                page = fitz_doc[page_num]
                
                # Check for images
                image_list = page.get_images()
                analysis["image_count"] += len(image_list)
                if image_list:
                    analysis["has_images"] = True
                
                # Extract text
                page_text = page.get_text()
                if page_text:
                    total_text += page_text
            
            fitz_doc.close()
            
            analysis["text_length"] = len(total_text.strip())
            analysis["has_text"] = analysis["text_length"] > 50
            analysis["text_extractable"] = analysis["text_length"] > 100
            
            logger.info(f"PDF Analysis: {analysis['pages']} pages, {analysis['image_count']} images, {analysis['text_length']} chars text")
            
        except Exception as e:
            logger.warning(f"Could not analyze PDF content: {str(e)}")
        
        return analysis
    
    def extract_content_from_bytes(self, pdf_content: bytes) -> Dict[str, Any]:
        """Extract content from PDF bytes using the superior extraction logic."""
        try:
            pdf_file = io.BytesIO(pdf_content)
            
            # Use both PyMuPDF and pdfplumber for comprehensive extraction
            fitz_doc = fitz.open(stream=pdf_file, filetype="pdf")
            
            result = {
                "total_pages": len(fitz_doc),
                "pages": []
            }
            
            # Reset stream for pdfplumber
            pdf_file.seek(0)
            
            with pdfplumber.open(pdf_file) as plumber_pdf:
                for page_num in range(len(plumber_pdf.pages)):
                    logger.info(f"Processing page {page_num + 1}/{result['total_pages']}")
                    
                    fitz_page = fitz_doc[page_num]
                    plumber_page = plumber_pdf.pages[page_num]
                    
                    page_content = self._extract_page_content(
                        page_num + 1, fitz_page, plumber_page
                    )
                    
                    result["pages"].append(page_content)
            
            fitz_doc.close()
            return result
            
        except Exception as e:
            logger.error(f"Error during content extraction: {e}")
            return {"error": f"Extraction failed: {str(e)}"}
    
    def process_pdf_reference(self, url: str) -> Dict[str, Any]:
        """Process a single PDF reference with enhanced logic - main interface method."""
        logger.info(f"Processing PDF: {url}")
        
        # Download PDF using 520 refresh strategy
        pdf_content = self.download_pdf_with_520_refresh(url)
        if not pdf_content:
            return {"error": "Failed to download PDF"}
        
        # Analyze PDF content
        analysis = self.analyze_pdf_content(pdf_content)
        
        # Decide extraction strategy based on analysis
        if not analysis["text_extractable"]:
            if analysis["has_images"] and analysis["text_length"] < 50:
                logger.info(f"PDF appears to be image-only: {url}")
                return {"notification": "PDF contains primarily image content with minimal extractable text"}
            else:
                logger.info(f"PDF has limited extractable text: {url}")
                return {"notification": "PDF has limited extractable text content"}
        
        # Proceed with extraction using superior logic
        logger.info(f"Extracting content from PDF with {analysis['text_length']} characters of text")
        extracted_content = self.extract_content_from_bytes(pdf_content)
        
        # Add analysis info to result
        result = {
            "url": url,
            "content": extracted_content,
            "extraction_timestamp": self.get_timestamp(),
            "analysis": analysis
        }
        
        # Add notification if PDF has images but we extracted text anyway
        if analysis["has_images"] and analysis["text_extractable"]:
            result["notification"] = f"PDF contains {analysis['image_count']} images but text was successfully extracted"
        
        return result
    
    def get_timestamp(self) -> str:
        """Get current timestamp."""
        return datetime.now().isoformat()
