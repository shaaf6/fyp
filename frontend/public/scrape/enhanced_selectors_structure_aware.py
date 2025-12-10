#!/usr/bin/env python3
"""
Structure-Aware SBP Circular Scraper
Implements proper classification using HTML table structure and section headers
- Uses table structure to distinguish circulars vs circular letters
- Proper number and date extraction
- Fixed reference formatting
- Accurate content extraction
- Integrated PDF content extraction

Usage:
    Basic scraping (PDF links only):
        python enhanced_selectors_structure_aware.py
    
    With PDF content extraction:
        python enhanced_selectors_structure_aware.py --extract-pdf
    
    The --extract-pdf flag enables:
    - Download and analysis of PDF files
    - Text and table extraction from PDFs
    - Image content detection and handling
    - Integration of extracted content into JSON output
    
    Output files:
    - Without --extract-pdf: {dept}_results_structure_aware.json
    - With --extract-pdf: {dept}_results_with_pdf_content.json
"""

import requests
from bs4 import BeautifulSoup
import json
import re
from datetime import datetime
from urllib.parse import urljoin, urlparse
import time
from pdf_content_extractor import EnhancedPDFContentExtractor
from circular_content_extractor import CircularContentExtractor

class StructureAwareCircularScraper:
    def __init__(self, extract_pdf_content=False, extract_circular_content=False):
        self.session = requests.Session()
        self.session.headers.update({
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        })
        
        # Initialize PDF extractor if requested
        self.extract_pdf_content = extract_pdf_content
        if self.extract_pdf_content:
            self.pdf_extractor = EnhancedPDFContentExtractor()
        
        # Initialize circular content extractor if requested
        self.extract_circular_enabled = extract_circular_content
        if self.extract_circular_enabled:
            self.circular_extractor = CircularContentExtractor(self)
        
        # Enhanced selectors
        self.selectors = {
            'year_links': 'a[href*="20"][href*="index.htm"]',
            'circular_table': 'table[width="95%"] table[width="95%"]',
            'table_rows': 'tr',
            'main_content': 'table[width="95%"], table[width="90%"], .content, #content',
            'pdf_links': 'a[href$=".pdf"]'
        }
        
        # Enhanced reference patterns with precise date extraction
        self.reference_patterns = {
            'circular_ref': r'([A-Z&]+(?:[\'\u2019]s)?)\s+circular\s+(?:no\.\s*)?(\d+)(?:\s+of\s+([A-Za-z]+\s+\d{1,2},\s+\d{4}|\d{4}))?(?:\s+dated\s+([A-Za-z]+\s+\d{1,2},\s+\d{4}))?',
            'letter_ref': r'([A-Z&]+(?:[\'\u2019]s)?)\s+circular\s+letter\s+(?:no\.\s*)?(\d+)(?:\s+of\s+([A-Za-z]+\s+\d{1,2},\s+\d{4}|\d{4}))?(?:\s+dated\s+([A-Za-z]+\s+\d{1,2},\s+\d{4}))?',
            'pdf_ref': r'annexure|attachment|enclosed|pdf'
        }

    def normalize_circular_title(self, title):
        """
        Normalize circular reference titles for consistent comparison
        
        This function standardizes:
        - Number formatting (removes leading zeros)
        - Date formatting (extracts year only)
        - Department name formatting
        
        Args:
            title (str): Original circular title
            
        Returns:
            str: Normalized title for comparison
        """
        if not title:
            return ""
        
        # Convert to lowercase for case-insensitive comparison
        normalized = title.lower().strip()
        
        # Extract components using regex patterns
        # Try circular pattern first
        circular_match = re.search(r'([a-z&]+(?:[\'\u2019]s)?)\s+circular\s+(?:no\.\s*)?(\d+)(?:\s+of\s+([a-za-z]+\s+\d{1,2},\s+\d{4}|\d{4}))?(?:\s+dated\s+([a-za-z]+\s+\d{1,2},\s+\d{4}))?', normalized, re.IGNORECASE)
        
        if circular_match:
            dept, number, date_of, date_dated = circular_match.groups()
            
            # Normalize department name
            dept = dept.strip()
            
            # Normalize number (remove leading zeros)
            number = str(int(number))
            
            # Extract year from either date format
            year = None
            if date_dated:
                # Extract year from "dated Month Day, Year" format
                year_match = re.search(r'\d{4}', date_dated)
                if year_match:
                    year = year_match.group()
            elif date_of:
                # Extract year from "of Year" or "of Month Day, Year" format
                year_match = re.search(r'\d{4}', date_of)
                if year_match:
                    year = year_match.group()
            
            # Construct normalized title
            normalized_title = f"{dept} circular {number}"
            if year:
                normalized_title += f" {year}"
            
            return normalized_title
        
        # Try circular letter pattern
        letter_match = re.search(r'([a-z&]+(?:[\'\u2019]s)?)\s+circular\s+letter\s+(?:no\.\s*)?(\d+)(?:\s+of\s+([a-za-z]+\s+\d{1,2},\s+\d{4}|\d{4}))?(?:\s+dated\s+([a-za-z]+\s+\d{1,2},\s+\d{4}))?', normalized, re.IGNORECASE)
        
        if letter_match:
            dept, number, date_of, date_dated = letter_match.groups()
            
            # Normalize department name
            dept = dept.strip()
            
            # Normalize number (remove leading zeros)
            number = str(int(number))
            
            # Extract year from either date format
            year = None
            if date_dated:
                year_match = re.search(r'\d{4}', date_dated)
                if year_match:
                    year = year_match.group()
            elif date_of:
                year_match = re.search(r'\d{4}', date_of)
                if year_match:
                    year = year_match.group()
            
            # Construct normalized title
            normalized_title = f"{dept} circular letter {number}"
            if year:
                normalized_title += f" {year}"
            
            return normalized_title
        
        # If no pattern matches, return the original normalized string
        return normalized

    def fetch_page(self, url):
        """Fetch and parse a web page"""
        try:
            print(f"Fetching: {url}")
            response = self.session.get(url, timeout=10)
            response.raise_for_status()
            return BeautifulSoup(response.content, 'html.parser')
        except Exception as e:
            print(f"Error fetching {url}: {e}")
            return None

    def extract_year_links(self, department_url):
        """Extract year links from department main page"""
        soup = self.fetch_page(department_url)
        if not soup:
            return []
        
        year_links = []
        links = soup.select(self.selectors['year_links'])
        
        for link in links:
            href = link.get('href', '')
            text = link.get_text(strip=True)
            
            # Extract year from href or text
            year_match = re.search(r'20\d{2}', href + text)
            if year_match:
                year = year_match.group()
                full_url = urljoin(department_url, href)
                
                # Avoid duplicates
                if not any(yl['year'] == year for yl in year_links):
                    year_links.append({
                        'year': year,
                        'url': full_url
                    })
        
        # Sort by year descending
        year_links.sort(key=lambda x: x['year'], reverse=True)
        return year_links

    def extract_number_from_text(self, text):
        """Extract circular/letter number from text"""
        # Try different patterns
        patterns = [
            r'(?:circular|letter)\s+no\.\s*(\d+)',  # Standard pattern
            r'no\.\s*(\d+)',  # Fallback pattern
            r'(\d+)\s+of\s+\d{4}'  # Alternative pattern
        ]
        
        for pattern in patterns:
            match = re.search(pattern, text, re.IGNORECASE)
            if match:
                return match.group(1)
        return None

    def clean_date_text(self, date_text):
        """Clean date text by removing line breaks, extra whitespace, and normalizing format"""
        if not date_text:
            return None
        
        # Remove line breaks, carriage returns, and normalize whitespace
        cleaned = re.sub(r'[\r\n\t]+', ' ', date_text)
        cleaned = re.sub(r'\s+', ' ', cleaned).strip()
        
        # If the cleaned text is empty or too short, return None
        if not cleaned or len(cleaned) < 3:
            return None
        
        return cleaned

    def extract_date_from_text(self, text):
        """Extract date from text"""
        if not text:
            return None
        
        # First clean the text
        text = self.clean_date_text(text)
        if not text:
            return None
        
        patterns = [
            r'(\w+\s+\d{1,2},\s+\d{4})',  # August 11, 2010
            r'(\d{1,2}\s+\w+\s+\d{4})',   # 11 August 2010
            r'(\d{1,2}/\d{1,2}/\d{4})',   # 11/08/2010
            r'(\d{4}-\d{2}-\d{2})',       # 2010-08-11
        ]
        
        for pattern in patterns:
            match = re.search(pattern, text)
            if match:
                return match.group(1)
        return None

    def extract_number_and_date_from_content(self, soup):
        """Extract number and date from document content (header area)"""
        # Look for the document header which typically contains the number and date
        header_text = ""
        
        # Try to find the main content table and get the first few lines
        main_table = soup.find('table', {'width': '95%'})
        if main_table:
            # Get the first 500 characters which usually contain the header
            header_text = main_table.get_text()[:500]
        
        # Extract number
        number = self.extract_number_from_text(header_text)
        
        # Extract date
        date = self.extract_date_from_text(header_text)
        
        return number, date

    def contains_target_keywords(self, text):
        """Check if text contains target keywords: KYC, CDD, AML, CFT, CPF"""
        if not text:
            return False
        
        target_keywords = ['KYC', 'CDD', 'AML', 'CFT', 'CPF', 'Customer Onboarding Framework', 'Framework', 'Customer Onboarding']
        
        # Use word boundaries to avoid false positives like 'AML' in 'StreamLining'
        for keyword in target_keywords:
            pattern = r'\b' + re.escape(keyword) + r'\b'
            if re.search(pattern, text, re.IGNORECASE):
                return True
        
        return False
    
    def extract_circular_links_from_table(self, year_url):
        """Extract circular links using table structure analysis"""
        soup = self.fetch_page(year_url)
        if not soup:
            return {'circulars': [], 'circular_letters': []}
        
        # Find all tables and look for the one containing circulars
        tables = soup.find_all('table')
        main_table = None
        
        # Extract year from URL for dynamic matching
        year_match = re.search(r'/(\d{4})/', year_url)
        target_year = year_match.group(1) if year_match else None
        
        for table in tables:
            table_text = table.get_text().lower()
            # Look for table containing 'circular' and the target year
            if 'circular' in table_text and (target_year and target_year in table_text):
                main_table = table
                break
        
        if not main_table:
            print("Could not find main circular table")
            return {'circulars': [], 'circular_letters': []}
        
        rows = main_table.find_all('tr')
        circulars = []
        circular_letters = []
        current_section = None  # Track whether we're in 'circulars' or 'circular_letters' section
        
        for row in rows:
            row_text = row.get_text(strip=True)
            
            # Check if this is a section header row - be more precise
            # Look for "Circular Letters YYYY" pattern first (more specific)
            if re.search(r'circular\s+letters?\s+\d{4}', row_text, re.IGNORECASE):
                current_section = 'circular_letters'
                print(f"📋 Found Circular Letters section: {row_text}")
                continue
            # Then look for "Circulars YYYY" pattern (but not if it contains "letter")
            elif re.search(r'circulars?\s+\d{4}', row_text, re.IGNORECASE) and 'letter' not in row_text.lower():
                current_section = 'circulars'
                print(f"📋 Found Circulars section: {row_text}")
                continue
            
            # Also check for section headers without year - be more precise
            # Look for standalone "Circular Letters" (not part of a larger text)
            if re.search(r'\bcircular\s+letters?\b', row_text, re.IGNORECASE) and len(row_text.strip()) < 50:
                current_section = 'circular_letters'
                print(f"📋 Found Circular Letters section (no year): {row_text}")
                continue
            # Look for standalone "Circulars" (not part of a larger text)
            elif re.search(r'\bcirculars?\b', row_text, re.IGNORECASE) and 'letter' not in row_text.lower() and len(row_text.strip()) < 50:
                current_section = 'circulars'
                print(f"📋 Found Circulars section (no year): {row_text}")
                continue
            
            # Check if this is a header row (contains column headers)
            if re.search(r'circular.*date.*description|noti.*date.*description', row_text, re.IGNORECASE):
                continue
            
            # Skip empty rows
            if not row_text or len(row_text.strip()) < 10:
                continue
            
            # Look for links in this row
            links = row.select('a[href$=".htm"]')
            if not links:
                continue
            
            # Extract data from table cells
            cells = row.select('td')
            if len(cells) < 3:
                continue
            
            # Extract the circular identifier from the first column
            circular_id = cells[0].get_text(strip=True) if cells else None
            # Normalize whitespace: replace multiple whitespace chars (including \r\n\t) with single space
            if circular_id:
                circular_id = re.sub(r'\s+', ' ', circular_id)
            # Extract the date from the second column and clean it
            raw_date = cells[1].get_text() if len(cells) > 1 else None
            table_date = self.clean_date_text(raw_date) if raw_date else None
            
            # For each link in the row (there might be multiple)
            for link in links:
                href = link.get('href', '')
                title = link.get_text(strip=True)
                # Normalize whitespace: replace multiple whitespace chars (including \r\n\t) with single space
                if title:
                    title = re.sub(r'\s+', ' ', title)
                
                if not href or not title:
                    continue
                
                full_url = urljoin(year_url, href)
                
                # Filter out irrelevant links (library, help, navigation, etc.)
                if any(keyword in full_url.lower() for keyword in [
                    'library', 'help', 'index.asp', 'sitemap', 'contact', 
                    'feedback', 'about', 'careers', 'events', 'javascript:'
                ]):
                    continue
                
                # Use the circular identifier from the table's first column
                # But only if it looks like a proper circular ID (not entire table content)
                if circular_id and len(circular_id) < 50 and re.search(r'\d+', circular_id):
                    number = circular_id
                else:
                    number = None  # Will be extracted from document content later
                date = table_date
                
                circular_data = {
                    'title': title,
                    'ID': number,
                    'date': date,
                    'url': full_url
                }
                
                # Apply keyword filtering - only include circulars with target keywords
                if not self.contains_target_keywords(title):
                    print(f"Skipping circular (no target keywords): {title}")
                    continue
                
                # Classify based on URL patterns first (most reliable), then section, then content
                # Strong URL-based classification (overrides section)
                if re.search(r'/CL\d+\.htm', full_url, re.IGNORECASE):
                    circular_letters.append(circular_data)
                    print(f"📝 Added Circular Letter (URL pattern): {title}")
                elif re.search(r'/C\d+\.htm', full_url, re.IGNORECASE):
                    circulars.append(circular_data)
                    print(f"📄 Added Circular (URL pattern): {title}")
                # Section-based classification (when URL pattern is not clear)
                elif current_section == 'circular_letters':
                    circular_letters.append(circular_data)
                    print(f"📝 Added Circular Letter (section): {title}")
                elif current_section == 'circulars':
                    circulars.append(circular_data)
                    print(f"📄 Added Circular (section): {title}")
                # Content-based fallback
                elif 'circular letter' in title.lower():
                    circular_letters.append(circular_data)
                    print(f"📝 Added Circular Letter (title): {title}")
                else:
                    circulars.append(circular_data)
                    print(f"📄 Added Circular (default): {title}")
        
        # Remove duplicates based on URL
        def deduplicate_by_url(items):
            seen_urls = set()
            unique_items = []
            for item in items:
                if item['url'] not in seen_urls:
                    seen_urls.add(item['url'])
                    unique_items.append(item)
            return unique_items
        
        circulars = deduplicate_by_url(circulars)
        circular_letters = deduplicate_by_url(circular_letters)
        
        # Sort by ID if available (extract number from ID for sorting)
        def sort_key(item):
            # Try to extract number from ID like "ACD Circular No. 02 of 2010"
            id_str = item.get('ID', '')
            if id_str:
                import re
                match = re.search(r'No\.\s*(\d+)', id_str)
                if match:
                    return int(match.group(1))
            return 999
        
        circulars.sort(key=sort_key)
        circular_letters.sort(key=sort_key)
        
        print(f"Extracted {len(circulars)} circulars and {len(circular_letters)} circular letters (after deduplication)")
        
        return {
            'circulars': circulars,
            'circular_letters': circular_letters
        }

    def detect_references(self, content, document_title="", circular_id=""):
        """Detect and categorize references in content - CAPTURES FULL CONTEXT"""
        references = []
        seen_references = set()  # Track seen references to avoid duplicates
        
        # Extract number, year, and type from circular_id for comparison
        circular_id_number = None
        circular_id_year = None
        circular_id_type = None
        if circular_id:
            # Check if it's a circular letter
            if 'letter' in circular_id.lower():
                circular_id_type = 'letter'
                id_match = re.search(r'circular\s+letter\s+no\.\s*(\d+)(?:\s+of\s+(\d{4}))?', circular_id, re.IGNORECASE)
            else:
                circular_id_type = 'circular'
                id_match = re.search(r'circular\s+no\.\s*(\d+)(?:\s+of\s+(\d{4}))?', circular_id, re.IGNORECASE)
            
            if id_match:
                circular_id_number = id_match.group(1)
                circular_id_year = id_match.group(2)
        

        
        # Find circular references in the full content
        circular_matches = list(re.finditer(self.reference_patterns['circular_ref'], content, re.IGNORECASE))
        letter_matches = list(re.finditer(self.reference_patterns['letter_ref'], content, re.IGNORECASE))
        
        # Process circular references
        for match in circular_matches:
            dept, number, date_of, date_dated = match.groups()
            
            # Reconstruct the precise reference title (check if original has "No.")
            original_text = match.group(0)
            if "no." in original_text.lower():
                title = f"{dept} Circular No. {number}"
            else:
                title = f"{dept} Circular {number}"
            if date_of:
                title += f" of {date_of}"
            if date_dated:
                title += f" dated {date_dated}"
            
            # Enhanced self-reference detection
            is_self_reference = False
            
            # Method 1: Compare with circular ID directly
            if circular_id and circular_id_type == 'circular':
                # Normalize both the detected reference and the circular ID
                normalized_reference = self.normalize_circular_title(title)
                normalized_circular_id = self.normalize_circular_title(circular_id)
                
                if normalized_reference and normalized_circular_id and normalized_reference == normalized_circular_id:
                    is_self_reference = True
                
                # Also check if the reference is essentially the same as circular ID with added date
                # e.g., "BPRD Circular No. 02" (ID) vs "BPRD Circular No. 02 of 2012" (reference)
                if not is_self_reference and normalized_circular_id and normalized_reference:
                    # Check if the circular ID is a prefix of the reference (same circular, just with date added)
                    if normalized_reference.startswith(normalized_circular_id + " "):
                        is_self_reference = True
            
            # Method 2: Compare with document title (existing logic)
            if not is_self_reference and document_title:
                normalized_title_ref = self.normalize_circular_title(title)
                normalized_document_title = self.normalize_circular_title(document_title)
                if normalized_title_ref and normalized_document_title and normalized_title_ref == normalized_document_title:
                    is_self_reference = True
                
                # Additional check: Skip if this reference is a subset of the document title
                if (not is_self_reference and normalized_title_ref and normalized_document_title and 
                    len(normalized_title_ref) < len(normalized_document_title) and
                    normalized_title_ref in normalized_document_title):
                    is_self_reference = True
            
            # Skip if this is a self-reference
            if is_self_reference:
                continue
            
            # Create a unique key for this reference to avoid duplicates
            ref_key = f"circular_{dept}_{number}_{date_of or date_dated or 'no_date'}"
            
            # Skip if already seen (avoid duplicates)
            if ref_key in seen_references:
                continue
            
            seen_references.add(ref_key)
            ref_obj = {
                'type': 'circular',
                'title': title  # Use precise reference title
            }
            
            # Extract circular content if enabled
            if self.extract_circular_enabled and hasattr(self, 'circular_extractor'):
                try:
                    print(f"🔍 Extracting content from circular: {title}")
                    content_result = self.circular_extractor.extract_circular_content(title)
                    if content_result and 'error' not in content_result:
                        # Place URL below title and above content
                        cached_url = self.circular_extractor.get_cached_url(title)
                        if cached_url:
                            ref_obj['url'] = cached_url
                        ref_obj['content'] = content_result
                    else:
                        # Place error below title and above content (if any)
                        error_info = content_result or {"error": "Content extraction failed"}
                        if 'error' in error_info:
                            ref_obj['error'] = error_info['error']
                        if 'attempted_urls' in error_info:
                            ref_obj['attempted_urls'] = error_info['attempted_urls']
                        # Only add content if there's actual content beyond the error
                        if error_info and len(error_info) > 1:
                            ref_obj['content'] = {k: v for k, v in error_info.items() if k not in ['error', 'attempted_urls']}
                except Exception as e:
                    print(f"❌ Failed to extract circular content from {title}: {e}")
                    # Place error below title
                    ref_obj['error'] = f"Content extraction failed: {str(e)}"
            
            references.append(ref_obj)
        
        # Process circular letter references
        for match in letter_matches:
            dept, number, date_of, date_dated = match.groups()
            
            # Reconstruct the precise reference title (check if original has "No.")
            original_text = match.group(0)
            if "no." in original_text.lower():
                title = f"{dept} Circular Letter No. {number}"
            else:
                title = f"{dept} Circular Letter {number}"
            if date_of:
                title += f" of {date_of}"
            if date_dated:
                title += f" dated {date_dated}"
            
            # Enhanced self-reference detection for circular letters
            is_self_reference = False
            
            # Method 1: Compare with circular ID directly
            if circular_id and circular_id_type == 'letter':
                # Normalize both the detected reference and the circular ID
                normalized_reference = self.normalize_circular_title(title)
                normalized_circular_id = self.normalize_circular_title(circular_id)
                
                if normalized_reference and normalized_circular_id and normalized_reference == normalized_circular_id:
                    is_self_reference = True
                
                # Also check if the reference is essentially the same as circular ID with added date
                if not is_self_reference and normalized_circular_id and normalized_reference:
                    # Check if the circular ID is a prefix of the reference (same circular, just with date added)
                    if normalized_reference.startswith(normalized_circular_id + " "):
                        is_self_reference = True
            
            # Method 2: Compare with document title (existing logic)
            if not is_self_reference and document_title:
                normalized_title_ref = self.normalize_circular_title(title)
                normalized_document_title = self.normalize_circular_title(document_title)
                if normalized_title_ref and normalized_document_title and normalized_title_ref == normalized_document_title:
                    is_self_reference = True
            
            # Skip if this is a self-reference
            if is_self_reference:
                continue
            
            # Create a unique key for this reference to avoid duplicates
            ref_key = f"letter_{dept}_{number}_{date_of or date_dated or 'no_date'}"
            
            # Skip if already seen (avoid duplicates)
            if ref_key in seen_references:
                continue
            
            seen_references.add(ref_key)
            ref_obj = {
                'type': 'circular_letter',
                'title': title  # Use precise reference title
            }
            
            # Extract circular content if enabled
            if self.extract_circular_enabled and hasattr(self, 'circular_extractor'):
                try:
                    print(f"🔍 Extracting content from circular letter: {title}")
                    content_result = self.circular_extractor.extract_circular_content(title)
                    if content_result and 'error' not in content_result:
                        # Place URL below title and above content
                        cached_url = self.circular_extractor.get_cached_url(title)
                        if cached_url:
                            ref_obj['url'] = cached_url
                        ref_obj['content'] = content_result
                    else:
                        # Place error below title and above content (if any)
                        error_info = content_result or {"error": "Content extraction failed"}
                        if 'error' in error_info:
                            ref_obj['error'] = error_info['error']
                        if 'attempted_urls' in error_info:
                            ref_obj['attempted_urls'] = error_info['attempted_urls']
                        # Only add content if there's actual content beyond the error
                        if error_info and len(error_info) > 1:
                            ref_obj['content'] = {k: v for k, v in error_info.items() if k not in ['error', 'attempted_urls']}
                except Exception as e:
                    print(f"❌ Failed to extract circular letter content from {title}: {e}")
                    # Place error below title
                    ref_obj['error'] = f"Content extraction failed: {str(e)}"
            
            references.append(ref_obj)
        
        return references

    def extract_pdf_links(self, soup, base_url):
        """Extract actual PDF links from the page and optionally extract content"""
        pdf_references = []
        
        # Find all PDF links
        pdf_links = soup.find_all('a', href=re.compile(r'\.pdf$', re.IGNORECASE))
        
        for link in pdf_links:
            href = link.get('href', '')
            text = link.get_text(strip=True)
            
            if href and text:
                # Normalize whitespace: replace multiple whitespace chars (including \r\n\t) with single space
                text = re.sub(r'\s+', ' ', text)
                
                # Convert relative URL to absolute
                from urllib.parse import urljoin
                full_url = urljoin(base_url, href)
                
                pdf_ref = {
                    'type': 'pdf',
                    'title': text,
                    'url': full_url
                }
                
                # Extract PDF content if enabled
                if self.extract_pdf_content and hasattr(self, 'pdf_extractor'):
                    try:
                        print(f"🔍 Extracting content from PDF: {text}")
                        content_result = self.pdf_extractor.process_pdf_reference(full_url)
                        pdf_ref['content'] = content_result
                    except Exception as e:
                        print(f"❌ Failed to extract PDF content from {full_url}: {e}")
                        pdf_ref['content'] = {"error": f"Content extraction failed: {str(e)}"}
                
                pdf_references.append(pdf_ref)
        
        return pdf_references





    def extract_structured_content(self, content_element, document_title=""):
        """Extract structured content preserving HTML organization"""
        content_blocks = []
        
        # Find the main content area (blockquote or main content div)
        # Search more deeply for blockquote, not just direct children
        main_area = content_element.find('blockquote')
        
        # Check if blockquote has meaningful content
        if main_area:
            blockquote_text = main_area.get_text(strip=True)
            if len(blockquote_text) < 50:  # Empty or minimal content
                main_area = None
        
        if not main_area:
            # For type2 structure, look for div with align="justify" which contains main content
            main_area = content_element.select_one('div[align="justify"]')
        
        if not main_area:
            # Fallback: look for any div that contains substantial content
            divs = content_element.find_all('div')
            for div in divs:
                div_text = div.get_text(strip=True)
                if len(div_text) > 500:  # Substantial content
                    main_area = div
                    break
        
        if not main_area:
            # Final fallback: use the content_element itself
            main_area = content_element
        
        if not main_area:
            return content_blocks
        
        # Process direct children to maintain sequence
        raw_blocks = []
        for element in main_area.children:
            if hasattr(element, 'name') and element.name:  # HTML elements
                block = self.parse_content_element(element, document_title)
                if block:
                    raw_blocks.append(block)
            else:  # Text nodes
                # Process meaningful text nodes that aren't just whitespace
                text_content = str(element).strip()
                if text_content and len(text_content) > 3:
                    # Clean and check if it's meaningful content
                    cleaned_text = self.clean_element_text(text_content)
                    if cleaned_text and not self.is_unwanted_content(cleaned_text, document_title):
                        # Check if it looks like numbered content or important text
                        if (re.match(r'^\d+\.', cleaned_text.strip()) or 
                            'acknowledge receipt' in cleaned_text.lower() or
                            len(cleaned_text) > 20):
                            raw_blocks.append({
                                'type': 'paragraph',
                                'text': cleaned_text
                            })
        
        # Group consecutive paragraphs together
        content_blocks = self.group_consecutive_content(raw_blocks)
        
        return content_blocks
    
    def group_consecutive_content(self, blocks):
        """Group consecutive paragraphs and detect hierarchical content"""
        if not blocks:
            return blocks
        
        grouped_blocks = []
        current_group = None
        
        i = 0
        while i < len(blocks):
            block = blocks[i]
            
            # Handle container blocks by expanding their nested blocks
            if block['type'] == 'container':
                # Recursively process the nested blocks
                nested_grouped = self.group_consecutive_content(block['blocks'])
                for nested_block in nested_grouped:
                    # Process each nested block as if it were a regular block
                    if nested_block['type'] == 'paragraph':
                        # Regular paragraph handling
                        if current_group and current_group['type'] == 'content':
                            # Add to existing content group
                            current_group['text'] += '\n\n' + nested_block['text']
                        else:
                            # Start new content group
                            if current_group:
                                grouped_blocks.append(current_group)
                            current_group = {
                                'type': 'content',
                                'text': nested_block['text']
                            }
                    else:
                        # Other types, close current group and add directly
                        if current_group:
                            grouped_blocks.append(current_group)
                            current_group = None
                        grouped_blocks.append(nested_block)
                i += 1
                continue
            
            if block['type'] == 'paragraph':
                # Check if this is a numbered point that might have sub-content
                if self.is_numbered_point(block['text']) and i + 1 < len(blocks):
                    # Look ahead for lists or tables that might belong to this point
                    sub_content = []
                    j = i + 1
                    
                    while j < len(blocks) and blocks[j]['type'] in ['list', 'table']:
                        sub_content.append(blocks[j])
                        j += 1
                    
                    if sub_content:
                        # Close any existing content group
                        if current_group:
                            grouped_blocks.append(current_group)
                            current_group = None
                        
                        # Create hierarchical content block
                        hierarchical_block = {
                            'type': 'hierarchical_content',
                            'main_text': block['text'],
                            'sub_content': sub_content
                        }
                        grouped_blocks.append(hierarchical_block)
                        i = j  # Skip the processed sub-content
                        continue
                
                # Regular paragraph handling
                if current_group and current_group['type'] == 'content':
                    # Add to existing content group
                    current_group['text'] += '\n\n' + block['text']
                else:
                    # Start new content group
                    if current_group:
                        grouped_blocks.append(current_group)
                    current_group = {
                        'type': 'content',
                        'text': block['text']
                    }
            elif block['type'] == 'list':
                # Handle consecutive lists - merge them into a single list with sequential numbering
                if current_group and current_group['type'] == 'list':
                    # Extend current list group
                    current_group['items'].extend(block['items'])
                elif grouped_blocks and grouped_blocks[-1]['type'] == 'list':
                    # Extend last list in grouped_blocks
                    grouped_blocks[-1]['items'].extend(block['items'])
                else:
                    # Close any existing content group
                    if current_group:
                        grouped_blocks.append(current_group)
                        current_group = None
                    
                    # Start new list group
                    current_group = {
                        'type': 'list',
                        'items': block['items'][:]  # Copy the items
                    }
            else:
                # Other non-paragraph content, close current group if exists
                if current_group:
                    grouped_blocks.append(current_group)
                    current_group = None
                grouped_blocks.append(block)
            
            i += 1
        
        # Don't forget the last group
        if current_group:
            grouped_blocks.append(current_group)
        
        # Post-process to renumber merged lists sequentially
        for block in grouped_blocks:
            if block['type'] == 'list' and len(block['items']) > 1:
                # Renumber items sequentially
                for i, item in enumerate(block['items'], 1):
                    # Handle both string items and dictionary items with 'text' key
                    if isinstance(item, dict) and 'text' in item:
                        item_text = re.sub(r'^\d+\.\s*', '', item['text'].strip())
                        item['text'] = f"{i}. {item_text}"
                    elif isinstance(item, str):
                        # Remove existing numbering and add sequential numbering
                        item_text = re.sub(r'^\d+\.\s*', '', item.strip())
                        block['items'][i-1] = f"{i}. {item_text}"
        
        return grouped_blocks
    
    def is_numbered_point(self, text):
        """Check if text starts with a numbered point pattern"""
        if not text:
            return False
        
        # Pattern for numbered points like "1.", "2)", "A.", "i)", etc.
        numbered_patterns = [
            r'^\s*\d+[\.\)]\s+',  # 1. or 1)
            r'^\s*[A-Z][\.\)]\s+',  # A. or A)
            r'^\s*[a-z][\.\)]\s+',  # a. or a)
            r'^\s*[IVX]+[\.\)]\s+',  # I. or IV)
            r'^\s*[ivx]+[\.\)]\s+'   # i. or iv)
        ]
        
        for pattern in numbered_patterns:
            if re.match(pattern, text):
                return True
        
        return False
    
    def parse_content_element(self, element, document_title=""):
        """Parse individual HTML elements into structured content blocks"""
        if not element or not hasattr(element, 'name'):
            return None
        
        tag_name = element.name.lower()
        
        # Handle paragraphs
        if tag_name == 'p':
            text = self.clean_element_text(element.get_text(separator=' ', strip=True))
            if text and not self.is_unwanted_content(text, document_title):
                return {
                    'type': 'paragraph',
                    'text': text
                }
        
        # Handle ordered and unordered lists
        elif tag_name in ['ol', 'ul']:
            items = self.parse_list_items(element)
            if items:
                return {
                    'type': 'list',
                    'items': items
                }
        
        # Handle tables
        elif tag_name == 'table':
            table_data = self.parse_table(element)
            if table_data:
                return table_data
        
        # Handle divs that might contain structured content
        elif tag_name == 'div':
            # Check if div contains meaningful content
            text = self.clean_element_text(element.get_text(separator=' ', strip=True))
            if text and not self.is_unwanted_content(text, document_title):
                return {
                    'type': 'paragraph',
                    'text': text
                }
        
        # Handle spans that might contain numbered content (like "2. In addition...")
        elif tag_name == 'span':
            text = self.clean_element_text(element.get_text(separator=' ', strip=True))
            # Only include spans that contain substantial content or numbered points
            if text and len(text) > 20 and not self.is_unwanted_content(text, document_title):
                return {
                    'type': 'paragraph',
                    'text': text
                }
        
        # Handle nested blockquotes by recursively processing their content
        elif tag_name == 'blockquote':
            nested_blocks = []
            for child in element.children:
                if hasattr(child, 'name') and child.name:
                    child_block = self.parse_content_element(child, document_title)
                    if child_block:
                        nested_blocks.append(child_block)
            
            # If we found content blocks, return them as a container
            if nested_blocks:
                # If there's only one block, return it directly
                if len(nested_blocks) == 1:
                    return nested_blocks[0]
                else:
                    # Multiple blocks - return as a container
                    return {
                        'type': 'container',
                        'blocks': nested_blocks
                    }
        
        return None
    
    def parse_list_items(self, list_element):
        """Parse list items with support for 3-level nesting and malformed HTML handling"""
        items = []
        numbering_style = self.get_list_numbering_style(list_element)
        
        # Get all direct children, handling both proper and malformed HTML
        all_children = []
        for child in list_element.children:
            if hasattr(child, 'name') and child.name in ['li', 'ol', 'ul']:
                all_children.append(child)
        
        current_number = 1
        i = 0
        
        while i < len(all_children):
            child = all_children[i]
            
            if child.name == 'li':
                # Extract text from this li, excluding nested lists
                li_text = ""
                for content in child.contents:
                    if hasattr(content, 'name'):
                        if content.name not in ['ol', 'ul']:
                            li_text += content.get_text(separator=' ', strip=True) + " "
                    else:
                        li_text += str(content).strip() + " "
                
                li_text = self.clean_element_text(li_text)
                
                # Format the list number
                formatted_number = self.format_list_number(current_number, numbering_style)
                if li_text and not li_text.startswith(formatted_number):
                    li_text = f"{formatted_number} {li_text}"
                
                # Look for nested lists
                sub_items = []
                
                # Check for nested lists within this li
                nested_lists = child.find_all(['ol', 'ul'], recursive=False)
                for nested_list in nested_lists:
                    nested_items = self.parse_list_items(nested_list)
                    if nested_items:
                        sub_items.extend(nested_items)
                
                # Check for malformed HTML: nested list as next sibling
                j = i + 1
                while j < len(all_children) and all_children[j].name in ['ol', 'ul']:
                    # Check if this nested list belongs to current li by examining context
                    next_list = all_children[j]
                    
                    # If the next element after this list is another li at the same level,
                    # then this nested list likely belongs to the current li
                    belongs_to_current = True
                    if j + 1 < len(all_children):
                        next_after_list = all_children[j + 1]
                        if next_after_list.name == 'li':
                            # This nested list belongs to current li
                            belongs_to_current = True
                        else:
                            belongs_to_current = False
                    
                    if belongs_to_current:
                        nested_items = self.parse_list_items(next_list)
                        if nested_items:
                            sub_items.extend(nested_items)
                        j += 1
                    else:
                        break
                
                # Update i to skip processed nested lists
                i = j - 1
                
                # Create item object
                if sub_items:
                    item_obj = {
                        'text': li_text,
                        'sub_items': sub_items
                    }
                    items.append(item_obj)
                elif li_text:
                    items.append(li_text)
                
                current_number += 1
            
            elif child.name in ['ol', 'ul']:
                # Standalone nested list (this shouldn't happen in well-formed HTML)
                nested_items = self.parse_list_items(child)
                if nested_items:
                    # If we have a previous item, try to attach to it
                    if items and isinstance(items[-1], dict) and 'sub_items' in items[-1]:
                        items[-1]['sub_items'].extend(nested_items)
                    elif items and isinstance(items[-1], str):
                        # Convert string item to object with sub_items
                        items[-1] = {
                            'text': items[-1],
                            'sub_items': nested_items
                        }
                    else:
                        # Add as standalone items
                        items.extend(nested_items)
            
            i += 1
        
        return items
    
    def get_list_numbering_style(self, list_element):
        """Determine the numbering style for ordered lists"""
        if list_element.name.lower() != 'ol':
            return None
        
        list_type = list_element.get('type', '1')
        return list_type
    
    def format_list_number(self, number, style):
        """Format list numbers according to style"""
        if not style or style == '1':
            return f"{number}."
        elif style == 'A':
            return f"{chr(64 + number)}."
        elif style == 'a':
            return f"{chr(96 + number)}."
        elif style == 'I':
            return f"{self.to_roman(number)}."
        elif style == 'i':
            return f"{self.to_roman(number).lower()}."
        else:
            return f"{number}."
    
    def to_roman(self, num):
        """Convert number to Roman numerals"""
        values = [1000, 900, 500, 400, 100, 90, 50, 40, 10, 9, 5, 4, 1]
        symbols = ["M", "CM", "D", "CD", "C", "XC", "L", "XL", "X", "IX", "V", "IV", "I"]
        result = ""
        for i in range(len(values)):
            count = num // values[i]
            result += symbols[i] * count
            num -= values[i] * count
        return result
    
    def parse_table(self, table_element):
        """Parse table structure with improved header detection and duplicate removal"""
        rows = table_element.find_all('tr')
        if not rows:
            return None
        
        headers = []
        table_data = []
        
        # Enhanced header detection
        first_row = rows[0]
        first_row_cells = first_row.find_all(['td', 'th'])
        
        # Check for explicit header tags or header-like content
        has_th_tags = any(cell.name == 'th' for cell in first_row_cells)
        
        # Detect headers based on multiple criteria
        is_header_row = has_th_tags
        if not is_header_row and first_row_cells:
            # Check if first row looks like headers (short, descriptive text)
            header_indicators = 0
            for cell in first_row_cells:
                cell_text = self.clean_element_text(cell.get_text(separator=' ', strip=True))
                if cell_text:
                    # Headers are typically short and descriptive
                    if len(cell_text) < 100 and any(word in cell_text.lower() for word in 
                        ['reference', 'requirement', 'description', 'name', 'type', 'date', 'number', 'status']):
                        header_indicators += 1
                    elif len(cell_text) < 30:  # Very short text likely to be header
                        header_indicators += 1
            
            # If majority of cells look like headers, treat as header row
            is_header_row = header_indicators >= len(first_row_cells) * 0.6
        
        start_row = 0
        if is_header_row and first_row_cells:
            headers = [self.clean_element_text(cell.get_text(separator=' ', strip=True)) 
                      for cell in first_row_cells]
            start_row = 1
        
        # Parse data rows with enhanced duplicate detection
        seen_rows = set()
        for row in rows[start_row:]:
            cells = row.find_all(['td', 'th'])
            if cells:
                row_data = []
                for cell in cells:
                    cell_text = self.clean_element_text(cell.get_text(separator=' ', strip=True))
                    row_data.append(cell_text if cell_text else "")
                
                # Skip empty rows
                if not any(cell.strip() for cell in row_data):
                    continue
                
                # Ensure row has same number of columns as headers (if headers exist)
                if headers and len(row_data) != len(headers):
                    # Pad or truncate to match header count
                    if len(row_data) < len(headers):
                        row_data.extend([""] * (len(headers) - len(row_data)))
                    else:
                        row_data = row_data[:len(headers)]
                
                # Create a signature for duplicate detection
                row_signature = tuple(cell.strip().lower() for cell in row_data)
                
                # Skip duplicate rows
                if row_signature in seen_rows:
                    continue
                
                # Skip rows that are identical to headers
                if headers:
                    header_signature = tuple(header.strip().lower() for header in headers)
                    if row_signature == header_signature:
                        continue
                
                # Skip rows that are subsets of other rows (incomplete duplicates)
                is_subset = False
                for seen_row in seen_rows:
                    if len(row_signature) < len(seen_row) and all(cell in seen_row for cell in row_signature if cell.strip()):
                        is_subset = True
                        break
                
                if is_subset:
                    continue
                
                # Skip rows with mostly empty cells (incomplete rows)
                non_empty_cells = sum(1 for cell in row_data if cell.strip())
                if headers and non_empty_cells < len(headers) * 0.5:  # Less than 50% filled
                    continue
                
                seen_rows.add(row_signature)
                table_data.append(row_data)
        
        if headers or table_data:
            result = {
                'type': 'table'
            }
            
            # Always put headers first if they exist
            if headers:
                result['headers'] = headers
            
            if table_data:
                result['rows'] = table_data
            
            return result
        
        return None
    
    def clean_element_text(self, text):
        """Clean text content from HTML elements"""
        if not text:
            return ""
        
        # Remove excessive whitespace
        text = re.sub(r'\s+', ' ', text).strip()
        
        # Remove common unwanted patterns but keep the content structure
        text = re.sub(r'^\s*&nbsp;\s*', '', text)
        text = re.sub(r'\s*&nbsp;\s*$', '', text)
        
        return text
    
    def is_unwanted_content(self, text, document_title=""):
        """Check if content should be excluded based on patterns"""
        if not text or len(text.strip()) < 3:
            return True
        
        # Skip navigation and header elements
        unwanted_patterns = [
            r'^(Home|Back|Print|Download|Search)$',
            r'^(Department|Circular|Notification)s?\s*$',
            r'^\s*\|\s*$',
            r'^\s*[-_=]+\s*$'
        ]
        
        for pattern in unwanted_patterns:
            if re.match(pattern, text.strip(), re.IGNORECASE):
                return True
        
        return False

    def extract_circular_content(self, circular_url, document_title="", circular_id=""):
        """Extract comprehensive content from circular page"""
        soup = self.fetch_page(circular_url)
        if not soup:
            return None

        # Remove script, style, and title elements from the entire soup first
        for script in soup(["script", "style", "title"]):
            script.decompose()

        # Try to find main content area - prioritize tables with substantial content
        main_content = None
        
        # Look for tables that match our selectors and have substantial content
        potential_tables = soup.select('table[width="95%"], table[width="90%"]')
        for table in potential_tables:
            table_text = table.get_text(strip=True)
            # Prioritize tables with substantial content (>1000 chars) and avoid navigation tables
            if len(table_text) > 1000 and not re.match(r'^Circulars/Notifications.*Department\s*$', table_text.strip()):
                main_content = table
                break
        
        # If no substantial table found, try other selectors
        if not main_content:
            main_content = soup.select_one('.content, #content')
        
        # Final fallback to full soup
        if not main_content:
            main_content = soup

        # Extract structured content
        structured_content = self.extract_structured_content(main_content, document_title)
        

        
        # Also extract text for reference detection and fallback
        full_text = main_content.get_text(separator=' ', strip=True)
        
        # Detect references BEFORE cleaning (to preserve circular references)
        references = self.detect_references(full_text, document_title, circular_id)
        
        # Extract PDF links
        pdf_references = self.extract_pdf_links(soup, circular_url)
        references.extend(pdf_references)
        
        return {
            'content': structured_content,
            'references': references
        }

    def process_department(self, department_name, department_url, max_years=None):
        """Process a single department and extract all circulars"""
        print(f"\nProcessing {department_name} Department")
        print(f"URL: {department_url}")
        
        # Extract year links
        year_links = self.extract_year_links(department_url)
        if not year_links:
            print(f"No year links found for {department_name}")
            return None
        
        # Determine how many years to process
        years_to_process = len(year_links) if max_years is None else min(len(year_links), max_years)
        print(f"📅 Found {len(year_links)} years: {[yl['year'] for yl in year_links[:years_to_process]]}")
        
        # Process each year
        department_data = {
            'department': department_name,
            'url': department_url,
            'total_years_processed': years_to_process,
            'processing_timestamp': datetime.now().isoformat(),
            'years': {}
        }
        
        total_circulars = 0
        total_circular_letters = 0
        
        for year_link in year_links[:years_to_process]:
            year = year_link['year']
            year_url = year_link['url']
            
            print(f"\n📅 Processing year {year}")
            
            # Extract circulars and circular letters using table structure
            year_data = self.extract_circular_links_from_table(year_url)
            
            # Process each circular
            for circular in year_data['circulars']:
                print(f"📄 Processing circular: {circular['title']}")
                
                # First, extract number and date to set proper ID
                soup = self.fetch_page(circular['url'])
                if soup:
                    number, date = self.extract_number_and_date_from_content(soup)
                    # Only use extracted number if we don't have a proper ID already
                    # This preserves full identifiers like "ACFID Circular No. 03 of 2025"
                    if number and (not circular.get('ID') or circular['ID'].isdigit()):
                        # Build full identifier for all years
                        circular['ID'] = f"{department_name.upper()} Circular No. {number.zfill(2)} of {year}"
                    if date:
                        circular['date'] = date
                
                # Now extract content with proper ID for reference detection
                content_data = self.extract_circular_content(circular['url'], circular['title'], circular.get('ID', ''))
                if content_data:
                    circular.update(content_data)
                            
                time.sleep(0.5)  # Rate limiting
            
            # Process each circular letter
            for letter in year_data['circular_letters']:
                print(f"📝 Processing circular letter: {letter['title']}")
                
                # First, extract number and date to set proper ID
                soup = self.fetch_page(letter['url'])
                if soup:
                    number, date = self.extract_number_and_date_from_content(soup)
                    # Only use extracted number if we don't have a proper ID already
                    # This preserves full identifiers like "AC&MFD Circular Letter No. 01 of 2025"
                    if number and (not letter.get('ID') or letter['ID'].isdigit()):
                        # Build full identifier for all years
                        letter['ID'] = f"{department_name.upper()} Circular Letter No. {number.zfill(2)} of {year}"
                    if date:
                        letter['date'] = date
                
                # Now extract content with proper ID for reference detection
                content_data = self.extract_circular_content(letter['url'], letter['title'], letter.get('ID', ''))
                if content_data:
                    letter.update(content_data)
                            
                time.sleep(0.5)  # Rate limiting
            
            department_data['years'][year] = {
                'circulars': year_data['circulars'],
                'circular_letters': year_data['circular_letters'],
                'summary': {
                    'total_circulars': len(year_data['circulars']),
                    'total_circular_letters': len(year_data['circular_letters'])
                }
            }
            
            total_circulars += len(year_data['circulars'])
            total_circular_letters += len(year_data['circular_letters'])
            
            print(f"✅ Year {year}: {len(year_data['circulars'])} circulars, {len(year_data['circular_letters'])} circular letters")
        
        # Add summary
        department_data['summary'] = {
            'total_circulars': total_circulars,
            'total_circular_letters': total_circular_letters
        }
        
        print(f"\n🎯 {department_name} Summary:")
        print(f"   📄 Total Circulars: {total_circulars}")
        print(f"   📝 Total Circular Letters: {total_circular_letters}")
        
        return department_data

    def save_department_data(self, department_data, filename):
        """Save department data to JSON file"""
        try:
            with open(filename, 'w', encoding='utf-8') as f:
                json.dump(department_data, f, indent=2, ensure_ascii=False)
            print(f"💾 Saved data to {filename}")
        except Exception as e:
            print(f"❌ Error saving to {filename}: {e}")

def main():
    """Main execution function"""
    import sys
    
    # Check for extraction flags
    extract_pdf = '--extract-pdf' in sys.argv
    extract_circular = '--extract-circular' in sys.argv
    
    if extract_pdf:
        print("🔍 PDF content extraction enabled")
    if extract_circular:
        print("🔍 Circular content extraction enabled")
    
    scraper = StructureAwareCircularScraper(
        extract_pdf_content=extract_pdf,
        extract_circular_content=extract_circular
    )
    
    # Department configurations
    departments = {
        'ACD': 'https://www.sbp.org.pk/acd/index.htm',
        'BPD': 'https://www.sbp.org.pk/bpd/index.htm',
        'BSRVD': 'https://www.sbp.org.pk/bsrvd/index.htm',
        'BSD': 'https://www.sbp.org.pk/bsd/index.htm',
        'MFD': 'https://www.sbp.org.pk/MFD/index.htm',
        'BPRD': 'https://www.sbp.org.pk/bprd/index.htm'
    }
    
    print("Starting Structure-Aware SBP Circular Scraper")
    print("=" * 60)
    
    for dept_name, dept_url in departments.items():
        try:
            # Process department
            dept_data = scraper.process_department(dept_name, dept_url, max_years=None)
            
            if dept_data:
                # Save to separate file with appropriate suffix
                suffix_parts = []
                if extract_pdf:
                    suffix_parts.append("pdf")
                if extract_circular:
                    suffix_parts.append("circular")
                
                if suffix_parts:
                    suffix = f"_with_{'_'.join(suffix_parts)}_content"
                else:
                    suffix = "_structure_aware"
                
                filename = f"{dept_name.lower()}_results{suffix}.json"
                scraper.save_department_data(dept_data, filename)
            else:
                print(f"ERROR: Failed to process {dept_name}")
                
        except Exception as e:
            print(f"ERROR: Error processing {dept_name}: {e}")
    
    print("\nScraping completed!")
    if extract_pdf:
        print("PDF content has been extracted and integrated into the results")
    if extract_circular:
        print("Circular content has been extracted and integrated into the results")

if __name__ == "__main__":
    main()