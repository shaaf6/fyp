#!/usr/bin/env python3
"""
Circular Content Extractor
Extracts content from referenced circulars by constructing URLs and reusing existing scraping logic
- Parses reference titles to extract department, number, year
- Maps departments to URL codes with historical awareness
- Constructs and tests multiple URL patterns
- Implements global caching with cycle prevention
- Supports unlimited recursive reference extraction

Usage:
    from circular_content_extractor import CircularContentExtractor
    
    extractor = CircularContentExtractor(main_scraper_instance)
    content = extractor.extract_circular_content("AC&MFD Circular No. 01 of 2014 dated January 29, 2014")
"""

import re
import json
import os
from datetime import datetime
from urllib.parse import urljoin
import time


class CircularReferenceParser:
    """Parses circular reference titles to extract structured information"""
    
    def __init__(self):
        # Enhanced patterns to match the existing reference detection logic
        # Made "No." optional to handle titles like "BPRD Circular Letter 19 of 2021"
        self.patterns = {
            'circular': r'([A-Z&]+(?:[\'\u2019]s)?)\s+circular\s+(?:no\.\s*)?(\d+)(?:\s+of\s+((?:[A-Za-z]+\s+\d{1,2}(?:st|nd|rd|th)?|[0-9]{1,2}(?:st|nd|rd|th)?\s+[A-Za-z]+)(?:,\s*|\s+)\d{4}|\d{4}))?(?:\s+dated\s+((?:[A-Za-z]+\s+\d{1,2}(?:st|nd|rd|th)?|[0-9]{1,2}(?:st|nd|rd|th)?\s+[A-Za-z]+)(?:,\s*|\s+)\d{4}))?',
            'circular_letter': r'([A-Z&]+(?:[\'\u2019]s)?)\s+circular\s+letter\s+(?:no\.\s*)?(\d+)(?:\s+of\s+((?:[A-Za-z]+\s+\d{1,2}(?:st|nd|rd|th)?|[0-9]{1,2}(?:st|nd|rd|th)?\s+[A-Za-z]+)(?:,\s*|\s+)\d{4}|\d{4}))?(?:\s+dated\s+((?:[A-Za-z]+\s+\d{1,2}(?:st|nd|rd|th)?|[0-9]{1,2}(?:st|nd|rd|th)?\s+[A-Za-z]+)(?:,\s*|\s+)\d{4}))?'
        }
    
    def parse_reference_title(self, title):
        """
        Parse a reference title to extract structured information
        
        Args:
            title (str): Reference title like "AC&MFD Circular No. 01 of 2014 dated January 29, 2014"
            
        Returns:
            dict: Parsed information with keys: department, type, number, year, date
        """
        if not title:
            return None
        
        # Try circular letter pattern first (more specific)
        for ref_type, pattern in self.patterns.items():
            match = re.search(pattern, title, re.IGNORECASE)
            if match:
                dept, number, date_of, date_dated = match.groups()
                
                # Extract year from date_of or date_dated
                year = None
                date = None
                
                if date_of:
                    # Could be "2014" or "January 29, 2014"
                    year_match = re.search(r'(\d{4})', date_of)
                    if year_match:
                        year = year_match.group(1)
                    date = date_of
                
                if date_dated:
                    year_match = re.search(r'(\d{4})', date_dated)
                    if year_match:
                        year = year_match.group(1)
                    date = date_dated
                
                return {
                    'department': dept,
                    'type': ref_type,
                    'number': number.zfill(2),  # Ensure 2-digit format
                    'year': year,
                    'date': date,
                    'original_title': title
                }
        
        return None


class DepartmentMapper:
    """Maps department names to URL codes with historical awareness"""
    
    def __init__(self):
        # Current department mappings
        self.department_mappings = {
            'AC&MFD': 'acd',
            'ACMFD': 'acd',  # Alternative format
            'ACD': 'acd',    # Direct ACD mapping
            'ACFID': 'acd',  # ACFID maps to ACD
            'BPD': 'bprd',   # Default to newer mapping
            'BPRD': 'bprd',  # Direct BPRD mapping
            'BSD': 'bsrvd',  # Default to newer mapping
        }
        
        # Historical mappings for BSD and BPD
        self.bsd_transition_date = datetime(2006, 10, 1)  # October 2006
        self.bpd_transition_year = 2007  # BPD transitions to bprd from 2007 onwards
    
    def get_department_code(self, dept_name, year=None):
        """
        Get department URL code with historical awareness
        
        Args:
            dept_name (str): Department name like "AC&MFD", "BPD", "BSD"
            year (str): Year for historical mapping decisions
            
        Returns:
            str: Department code for URL construction
        """
        if not dept_name:
            return None
        
        # Normalize department name
        dept_name = dept_name.upper().replace('&', '&')
        
        # Handle BSD special case with historical mapping
        if dept_name == 'BSD' and year:
            try:
                year_int = int(year)
                if year_int < 2006 or (year_int == 2006):
                    # Before October 2006, use 'bsd'
                    return 'bsd'
                else:
                    # October 2006 onwards, use 'bsrvd'
                    return 'bsrvd'
            except (ValueError, TypeError):
                # If year parsing fails, default to newer mapping
                return 'bsrvd'
        
        # Handle BPD special case with historical mapping
        if dept_name in ['BPD', 'BPRD'] and year:
            try:
                year_int = int(year)
                if year_int <= 2006:
                    # 2006 and previous years, use 'bpd'
                    return 'bpd'
                else:
                    # 2007 onwards, use 'bprd'
                    return 'bprd'
            except (ValueError, TypeError):
                # If year parsing fails, default to newer mapping
                return 'bprd'
        
        # Standard mappings
        return self.department_mappings.get(dept_name)
    
    def extract_department_from_url(self, dept_url):
        """
        Extract department code from URL for future scalability
        
        Args:
            dept_url (str): Department URL like "https://www.sbp.org.pk/acd/"
            
        Returns:
            str: Extracted department code
        """
        if not dept_url:
            return None
        
        # Extract department code from URL path
        match = re.search(r'sbp\.org\.pk/([^/]+)/?', dept_url)
        if match:
            return match.group(1).lower()
        
        return None


class CircularURLConstructor:
    """Constructs and validates circular URLs using multiple patterns"""
    
    def __init__(self, session=None):
        self.session = session
        self.base_url = "https://www.sbp.org.pk"
    
    def construct_possible_urls(self, dept_code, number, year, ref_type):
        """
        Construct all possible URL patterns for a circular reference
        
        Args:
            dept_code (str): Department code like 'acd', 'bprd'
            number (str): Circular number like '01', '05'
            year (str): Year like '2014', '2020'
            ref_type (str): 'circular' or 'circular_letter'
            
        Returns:
            list: List of possible URLs to try
        """
        if not all([dept_code, number, year]):
            return []

        # Determine file prefixes based on type
        if ref_type == 'circular_letter':
            prefixes = ['CL', 'cl']
        else:
            prefixes = ['C', 'c']

        # Prepare number variations (with and without leading zeros)
        number_variations = []
        
        # Add the original number as provided
        number_variations.append(number)
        
        # Add zero-padded version if not already padded
        if len(number) == 1:
            number_variations.append(f"0{number}")
        
        # Add non-zero-padded version if currently padded
        if len(number) == 2 and number.startswith('0'):
            number_variations.append(number.lstrip('0') or '0')

        # Remove duplicates while preserving order
        seen = set()
        unique_numbers = []
        for num in number_variations:
            if num not in seen:
                seen.add(num)
                unique_numbers.append(num)

        urls = []
        for prefix in prefixes:
            for num in unique_numbers:
                url = f"{self.base_url}/{dept_code}/{year}/{prefix}{num}.htm"
                urls.append(url)

        return urls
    
    def find_working_url(self, possible_urls):
        """
        Test URLs to find the working one
        
        Args:
            possible_urls (list): List of URLs to test
            
        Returns:
            str or None: Working URL or None if none work
        """
        if not possible_urls or not self.session:
            return None
        
        for url in possible_urls:
            try:
                print(f"🔍 Testing URL: {url}")
                # Use GET request instead of HEAD since SBP server doesn't properly support HEAD
                response = self.session.get(url, timeout=10)
                if response.status_code == 200:
                    print(f"✅ Found working URL: {url}")
                    return url
                else:
                    print(f"❌ URL failed with status {response.status_code}: {url}")
            except Exception as e:
                print(f"❌ URL test failed: {url} - {e}")
        
        print(f"❌ No working URL found from {len(possible_urls)} attempts")
        return None


class CircularContentCache:
    """Global caching system with file persistence and cycle prevention"""
    
    def __init__(self, cache_file="circular_content_cache.json"):
        self.cache_file = cache_file
        self.cache = {}
        self.processing_stack = set()  # Track currently processing references (normalized titles)
        self.load_cache()
    
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
        circular_match = re.search(r'([a-z&]+(?:[\'\u2019]s)?)\s+circular\s+(?:no\.\s*)?(\d+)(?:\s+of\s+((?:[a-z]+\s+\d{1,2}(?:st|nd|rd|th)?|[0-9]{1,2}(?:st|nd|rd|th)?\s+[a-z]+)(?:,\s*|\s+)\d{4}|\d{4}))?(?:\s+dated\s+((?:[a-z]+\s+\d{1,2}(?:st|nd|rd|th)?|[0-9]{1,2}(?:st|nd|rd|th)?\s+[a-z]+)(?:,\s*|\s+)\d{4}))?', normalized, re.IGNORECASE)
        
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
        letter_match = re.search(r'([a-z&]+(?:[\'\u2019]s)?)\s+circular\s+letter\s+(?:no\.\s*)?(\d+)(?:\s+of\s+((?:[a-z]+\s+\d{1,2}(?:st|nd|rd|th)?|[0-9]{1,2}(?:st|nd|rd|th)?\s+[a-z]+)(?:,\s*|\s+)\d{4}|\d{4}))?(?:\s+dated\s+((?:[a-z]+\s+\d{1,2}(?:st|nd|rd|th)?|[0-9]{1,2}(?:st|nd|rd|th)?\s+[a-z]+)(?:,\s*|\s+)\d{4}))?', normalized, re.IGNORECASE)
        
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

    def load_cache(self):
        """Load existing cache from disk"""
        if os.path.exists(self.cache_file):
            try:
                with open(self.cache_file, 'r', encoding='utf-8') as f:
                    self.cache = json.load(f)
                print(f"📁 Loaded {len(self.cache)} cached circular contents")
            except Exception as e:
                print(f"❌ Failed to load cache: {e}")
                self.cache = {}
        else:
            print("📁 No existing cache found, starting fresh")
    
    def save_cache(self):
        """Save cache to disk"""
        try:
            with open(self.cache_file, 'w', encoding='utf-8') as f:
                json.dump(self.cache, f, indent=2, ensure_ascii=False)
            print(f"💾 Saved cache with {len(self.cache)} entries")
        except Exception as e:
            print(f"❌ Failed to save cache: {e}")
    
    def is_cached(self, reference_title):
        """Check if reference is already cached"""
        return reference_title in self.cache
    
    def get_cached_content(self, reference_title):
        """Get cached content for reference"""
        if reference_title in self.cache:
            cached_item = self.cache[reference_title]
            print(f"🎯 Cache hit for: {reference_title}")
            return cached_item.get('content'), cached_item.get('url')
        return None, None
    
    def cache_content(self, reference_title, content, url):
        """Cache content for reference"""
        self.cache[reference_title] = {
            'content': content,
            'url': url,
            'extracted_at': datetime.now().isoformat()
        }
        self.save_cache()
        print(f"💾 Cached content for: {reference_title}")
    
    def is_processing(self, reference_title):
        """Check if reference is currently being processed (cycle prevention)"""
        normalized_title = self.normalize_circular_title(reference_title)
        return normalized_title in self.processing_stack
    
    def start_processing(self, reference_title):
        """Mark reference as being processed"""
        normalized_title = self.normalize_circular_title(reference_title)
        self.processing_stack.add(normalized_title)
    
    def finish_processing(self, reference_title):
        """Mark reference as finished processing"""
        normalized_title = self.normalize_circular_title(reference_title)
        self.processing_stack.discard(normalized_title)


class CircularContentExtractor:
    """Main circular content extraction orchestrator"""
    
    def __init__(self, main_scraper_instance):
        """
        Initialize with reference to main scraper to reuse its methods
        
        Args:
            main_scraper_instance: Instance of StructureAwareCircularScraper
        """
        self.scraper = main_scraper_instance
        self.parser = CircularReferenceParser()
        self.mapper = DepartmentMapper()
        self.url_constructor = CircularURLConstructor(self.scraper.session)
        self.cache = CircularContentCache()

    def extract_circular_content(self, reference_title):
        """
        Extract content from a circular reference
        
        Args:
            reference_title (str): Reference title to extract content for
            
        Returns:
            dict: Extracted content with nested references
        """
        if not reference_title:
            return {"error": "No reference title provided"}
        
        # Check for circular reference (cycle prevention)
        if self.cache.is_processing(reference_title):
            return {"error": "Circular reference detected", "title": reference_title}
        
        # Check cache first
        cached_content, cached_url = self.cache.get_cached_content(reference_title)
        if cached_content:
            return cached_content
        
        # Mark as processing
        self.cache.start_processing(reference_title)
        
        try:
            # Parse reference title
            parsed_ref = self.parser.parse_reference_title(reference_title)
            if not parsed_ref:
                return {"error": "Could not parse reference title", "title": reference_title}
            
            # Get department code
            dept_code = self.mapper.get_department_code(parsed_ref['department'], parsed_ref['year'])
            if not dept_code:
                return {"error": f"Unknown department: {parsed_ref['department']}", "title": reference_title}
            
            # Construct possible URLs
            possible_urls = self.url_constructor.construct_possible_urls(
                dept_code, parsed_ref['number'], parsed_ref['year'], parsed_ref['type']
            )
            
            if not possible_urls:
                return {"error": "Could not construct URLs", "title": reference_title}
            
            # Find working URL
            working_url = self.url_constructor.find_working_url(possible_urls)
            if not working_url:
                return {
                    "error": "No working URL found", 
                    "title": reference_title,
                    "attempted_urls": possible_urls
                }
            
            # Extract content using existing scraper logic
            content = self.scraper.extract_circular_content(working_url, reference_title)
            if not content:
                return {"error": "Failed to extract content", "url": working_url, "title": reference_title}
            
            # Process nested references recursively
            if 'references' in content:
                for ref in content['references']:
                    if ref.get('type') in ['circular', 'circular_letter']:
                        # Recursively extract content for nested references
                        nested_content = self.extract_circular_content(ref['title'])
                        if nested_content and 'error' not in nested_content:
                            # Place URL below title and above content for nested references
                            cached_url = self.get_cached_url(ref['title'])
                            if cached_url:
                                ref['url'] = cached_url
                            ref['content'] = nested_content
                        else:
                            # Place error below title for nested references
                            error_info = nested_content or {"error": "Content extraction failed"}
                            if 'error' in error_info:
                                ref['error'] = error_info['error']
                            if 'attempted_urls' in error_info:
                                ref['attempted_urls'] = error_info['attempted_urls']
                            # Only add content if there's actual content beyond the error
                            if error_info and len(error_info) > 1:
                                ref['content'] = {k: v for k, v in error_info.items() if k not in ['error', 'attempted_urls']}
            
            # Cache the result
            self.cache.cache_content(reference_title, content, working_url)
            
            return content
            
        except Exception as e:
            print(f"❌ Error extracting circular content: {e}")
            return {"error": f"Extraction failed: {str(e)}", "title": reference_title}
        
        finally:
            # Always remove from processing stack
            self.cache.finish_processing(reference_title)
    
    def get_cached_url(self, reference_title):
        """Get the cached URL for a reference"""
        cached_item = self.cache.cache.get(reference_title)
        if cached_item:
            return cached_item.get('url')
        return None