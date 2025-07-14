// Enhanced Content script for ETA Invoice Exporter - Fixed to Load ALL Invoices
class ETAContentScript {
  constructor() {
    this.invoiceData = [];
    this.allPagesData = [];
    this.totalCount = 0;
    this.currentPage = 1;
    this.totalPages = 1;
    this.isProcessingAllPages = false;
    this.progressCallback = null;
    this.domObserver = null;
    this.pageLoadTimeout = 15000; // 15 seconds timeout
    this.init();
  }
  
  init() {
    console.log('ETA Exporter: Content script initialized');
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => this.scanForInvoices());
    } else {
      setTimeout(() => this.scanForInvoices(), 1000);
    }
    
    this.setupMutationObserver();
  }
  
  setupMutationObserver() {
    this.observer = new MutationObserver((mutations) => {
      let shouldRescan = false;
      
      mutations.forEach((mutation) => {
        if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
          mutation.addedNodes.forEach((node) => {
            if (node.nodeType === Node.ELEMENT_NODE) {
              if (node.classList?.contains('ms-DetailsRow') || 
                  node.querySelector?.('.ms-DetailsRow') ||
                  node.classList?.contains('ms-List-cell')) {
                shouldRescan = true;
              }
            }
          });
        }
      });
      
      if (shouldRescan && !this.isProcessingAllPages) {
        clearTimeout(this.rescanTimeout);
        this.rescanTimeout = setTimeout(() => this.scanForInvoices(), 800);
      }
    });
    
    this.observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }
  
  scanForInvoices() {
    try {
      console.log('ETA Exporter: Starting invoice scan...');
      this.invoiceData = [];
      
      // Extract pagination info first
      this.extractPaginationInfo();
      
      // Find invoice rows
      const rows = this.getVisibleInvoiceRows();
      console.log(`ETA Exporter: Found ${rows.length} visible invoice rows on page ${this.currentPage}`);
      
      if (rows.length === 0) {
        console.warn('ETA Exporter: No invoice rows found. Trying alternative selectors...');
        const alternativeRows = this.getAlternativeInvoiceRows();
        console.log(`ETA Exporter: Found ${alternativeRows.length} rows with alternative selectors`);
        alternativeRows.forEach((row, index) => {
          const invoiceData = this.extractDataFromRow(row, index + 1);
          if (this.isValidInvoiceData(invoiceData)) {
            this.invoiceData.push(invoiceData);
          }
        });
      } else {
        rows.forEach((row, index) => {
          const invoiceData = this.extractDataFromRow(row, index + 1);
          if (this.isValidInvoiceData(invoiceData)) {
            this.invoiceData.push(invoiceData);
          }
        });
      }
      
      console.log(`ETA Exporter: Successfully extracted ${this.invoiceData.length} valid invoices from page ${this.currentPage}`);
      
    } catch (error) {
      console.error('ETA Exporter: Error scanning for invoices:', error);
    }
  }
  
  getVisibleInvoiceRows() {
    // Primary selectors for invoice rows
    const selectors = [
      '.ms-DetailsRow[role="row"]',
      '.ms-List-cell[role="gridcell"]',
      '[data-list-index]',
      '.ms-DetailsRow',
      '[role="row"]'
    ];
    
    for (const selector of selectors) {
      const rows = document.querySelectorAll(selector);
      const visibleRows = Array.from(rows).filter(row => 
        this.isRowVisible(row) && this.hasInvoiceData(row)
      );
      
      if (visibleRows.length > 0) {
        console.log(`ETA Exporter: Found ${visibleRows.length} rows using selector: ${selector}`);
        return visibleRows;
      }
    }
    
    return [];
  }
  
  getAlternativeInvoiceRows() {
    // Alternative selectors when primary ones fail
    const alternativeSelectors = [
      'tr[role="row"]',
      '.ms-List-cell',
      '[data-automation-key]',
      '.ms-DetailsRow-cell',
      'div[role="gridcell"]'
    ];
    
    const allRows = [];
    
    for (const selector of alternativeSelectors) {
      const elements = document.querySelectorAll(selector);
      Array.from(elements).forEach(element => {
        const row = element.closest('[role="row"]') || element.parentElement;
        if (row && this.hasInvoiceData(row) && !allRows.includes(row)) {
          allRows.push(row);
        }
      });
    }
    
    return allRows.filter(row => this.isRowVisible(row));
  }
  
  isRowVisible(row) {
    if (!row) return false;
    
    const rect = row.getBoundingClientRect();
    const style = window.getComputedStyle(row);
    
    return (
      rect.width > 0 && 
      rect.height > 0 &&
      style.display !== 'none' &&
      style.visibility !== 'hidden' &&
      style.opacity !== '0'
    );
  }
  
  hasInvoiceData(row) {
    if (!row) return false;
    
    // Check for electronic number or internal number
    const electronicNumber = row.querySelector('.internalId-link a, [data-automation-key="uuid"] a, .griCellTitle');
    const internalNumber = row.querySelector('.griCellSubTitle, [data-automation-key="uuid"] .griCellSubTitle');
    const totalAmount = row.querySelector('[data-automation-key="total"], .griCellTitleGray');
    
    return !!(electronicNumber?.textContent?.trim() || 
              internalNumber?.textContent?.trim() || 
              totalAmount?.textContent?.trim());
  }
  
  extractPaginationInfo() {
    try {
      // Extract total count from "Results: 304" text
      this.totalCount = this.extractTotalCount();
      
      // Extract current page from pagination buttons
      this.currentPage = this.extractCurrentPage();
      
      // Calculate total pages based on results per page
      const resultsPerPage = this.getResultsPerPage();
      this.totalPages = Math.ceil(this.totalCount / resultsPerPage);
      
      // Ensure we have valid values
      this.currentPage = Math.max(this.currentPage, 1);
      this.totalPages = Math.max(this.totalPages, this.currentPage);
      this.totalCount = Math.max(this.totalCount, this.invoiceData.length);
      
      console.log(`ETA Exporter: Page ${this.currentPage} of ${this.totalPages}, Total: ${this.totalCount} invoices (${resultsPerPage} per page)`);
      
    } catch (error) {
      console.warn('ETA Exporter: Error extracting pagination info:', error);
      // Set defaults
      this.currentPage = 1;
      this.totalPages = this.findMaxPageNumber() || 1;
      this.totalCount = this.invoiceData.length;
    }
  }
  
  extractTotalCount() {
    // Look for "Results: 304" pattern at the bottom of the page
    const resultElements = document.querySelectorAll('*');
    
    for (const element of resultElements) {
      const text = element.textContent || '';
      
      // Look for "Results: XXX" pattern
      const resultsMatch = text.match(/Results:\s*(\d+)/i);
      if (resultsMatch) {
        const count = parseInt(resultsMatch[1]);
        if (count > 0) {
          console.log(`ETA Exporter: Found total count ${count} from "Results:" text`);
          return count;
        }
      }
      
      // Look for Arabic patterns
      const arabicPatterns = [
        /النتائج:\s*(\d+)/i,
        /(\d+)\s*نتيجة/i,
        /من\s*(\d+)/i,
        /إجمالي:\s*(\d+)/i
      ];
      
      for (const pattern of arabicPatterns) {
        const match = text.match(pattern);
        if (match) {
          const count = parseInt(match[1]);
          if (count > 0) {
            console.log(`ETA Exporter: Found total count ${count} using Arabic pattern`);
            return count;
          }
        }
      }
    }
    
    // Fallback: look in pagination area
    const paginationArea = document.querySelector('.ms-CommandBar, [class*="pagination"], [class*="pager"]');
    if (paginationArea) {
      const text = paginationArea.textContent || '';
      const match = text.match(/(\d+)\s*-\s*(\d+)\s*of\s*(\d+)|(\d+)\s*-\s*(\d+)\s*من\s*(\d+)/i);
      if (match) {
        const total = parseInt(match[3] || match[6]);
        if (total > 0) {
          console.log(`ETA Exporter: Found total count ${total} from pagination area`);
          return total;
        }
      }
    }
    
    return 0;
  }
  
  getResultsPerPage() {
    // Try to determine how many results are shown per page
    const currentPageRows = this.invoiceData.length;
    
    // Common page sizes
    const commonPageSizes = [10, 20, 25, 50, 100];
    
    // If we have rows, use that as a hint
    if (currentPageRows > 0) {
      // Find the closest common page size
      for (const size of commonPageSizes) {
        if (currentPageRows <= size) {
          return size;
        }
      }
      return currentPageRows;
    }
    
    // Default assumption
    return 50;
  }
  
  extractCurrentPage() {
    // Look for active/selected page button
    const activePageSelectors = [
      '.ms-Button--primary[aria-pressed="true"]',
      '[aria-current="page"]',
      '.active',
      '.selected',
      '.current',
      '[class*="active"]',
      '[class*="selected"]'
    ];
    
    for (const selector of activePageSelectors) {
      const activeButton = document.querySelector(selector);
      if (activeButton) {
        const pageText = activeButton.textContent?.trim();
        const pageNum = parseInt(pageText);
        if (!isNaN(pageNum) && pageNum > 0) {
          return pageNum;
        }
      }
    }
    
    // Look for numbered pagination buttons and find the active one
    const pageButtons = document.querySelectorAll('button, a');
    for (const button of pageButtons) {
      const text = button.textContent?.trim();
      const pageNum = parseInt(text);
      
      if (!isNaN(pageNum) && pageNum > 0) {
        // Check if this button looks active
        const classes = button.className || '';
        const ariaPressed = button.getAttribute('aria-pressed');
        const ariaCurrent = button.getAttribute('aria-current');
        
        if (ariaPressed === 'true' || ariaCurrent === 'page' || 
            classes.includes('active') || classes.includes('selected') ||
            classes.includes('primary')) {
          return pageNum;
        }
      }
    }
    
    return 1;
  }
  
  findMaxPageNumber() {
    const pageButtons = document.querySelectorAll('button, a');
    let maxPage = 1;
    
    pageButtons.forEach(btn => {
      const buttonText = btn.textContent?.trim();
      const pageNum = parseInt(buttonText);
      
      if (!isNaN(pageNum) && pageNum > maxPage) {
        maxPage = pageNum;
      }
    });
    
    return maxPage;
  }
  
  extractDataFromRow(row, index) {
    const invoice = {
      index: index,
      pageNumber: this.currentPage,
      
      // Main invoice data matching Excel format
      serialNumber: index,
      viewButton: 'عرض',
      documentType: 'فاتورة',
      documentVersion: '1.0',
      status: '',
      issueDate: '',
      submissionDate: '',
      invoiceCurrency: 'EGP',
      invoiceValue: '',
      vatAmount: '',
      taxDiscount: '0',
      totalInvoice: '',
      internalNumber: '',
      electronicNumber: '',
      sellerTaxNumber: '',
      sellerName: '',
      sellerAddress: '',
      buyerTaxNumber: '',
      buyerName: '',
      buyerAddress: '',
      purchaseOrderRef: '',
      purchaseOrderDesc: '',
      salesOrderRef: '',
      electronicSignature: 'موقع إلكترونياً',
      foodDrugGuide: '',
      externalLink: '',
      
      // Additional fields
      issueTime: '',
      totalAmount: '',
      currency: 'EGP',
      submissionId: '',
      details: []
    };
    
    try {
      // Try to extract data using different methods
      this.extractUsingDataAttributes(row, invoice);
      this.extractUsingCellPositions(row, invoice);
      this.extractUsingTextContent(row, invoice);
      
      // Generate external link if we have electronic number
      if (invoice.electronicNumber) {
        invoice.externalLink = this.generateExternalLink(invoice);
      }
      
    } catch (error) {
      console.warn(`ETA Exporter: Error extracting data from row ${index}:`, error);
    }
    
    return invoice;
  }
  
  extractUsingDataAttributes(row, invoice) {
    // Method 1: Using data-automation-key attributes
    const cells = row.querySelectorAll('.ms-DetailsRow-cell, [data-automation-key]');
    
    cells.forEach(cell => {
      const key = cell.getAttribute('data-automation-key');
      
      switch (key) {
        case 'uuid':
          const electronicLink = cell.querySelector('.internalId-link a.griCellTitle, a');
          if (electronicLink) {
            invoice.electronicNumber = electronicLink.textContent?.trim() || '';
          }
          
          const internalNumberElement = cell.querySelector('.griCellSubTitle');
          if (internalNumberElement) {
            invoice.internalNumber = internalNumberElement.textContent?.trim() || '';
          }
          break;
          
        case 'dateTimeReceived':
          const dateElement = cell.querySelector('.griCellTitleGray, .griCellTitle');
          const timeElement = cell.querySelector('.griCellSubTitle');
          
          if (dateElement) {
            invoice.issueDate = dateElement.textContent?.trim() || '';
            invoice.submissionDate = invoice.issueDate;
          }
          if (timeElement) {
            invoice.issueTime = timeElement.textContent?.trim() || '';
          }
          break;
          
        case 'typeName':
          const typeElement = cell.querySelector('.griCellTitleGray, .griCellTitle');
          const versionElement = cell.querySelector('.griCellSubTitle');
          
          if (typeElement) {
            invoice.documentType = typeElement.textContent?.trim() || 'فاتورة';
          }
          if (versionElement) {
            invoice.documentVersion = versionElement.textContent?.trim() || '1.0';
          }
          break;
          
        case 'total':
          const totalElement = cell.querySelector('.griCellTitleGray, .griCellTitle');
          if (totalElement) {
            const totalText = totalElement.textContent?.trim() || '';
            invoice.totalAmount = totalText;
            invoice.totalInvoice = totalText;
            
            // Calculate VAT and invoice value
            const totalValue = this.parseAmount(totalText);
            if (totalValue > 0) {
              const vatRate = 0.14;
              const vatAmount = (totalValue * vatRate) / (1 + vatRate);
              const invoiceValue = totalValue - vatAmount;
              
              invoice.vatAmount = this.formatAmount(vatAmount);
              invoice.invoiceValue = this.formatAmount(invoiceValue);
            }
          }
          break;
          
        case 'issuerName':
          const sellerNameElement = cell.querySelector('.griCellTitleGray, .griCellTitle');
          const sellerTaxElement = cell.querySelector('.griCellSubTitle');
          
          if (sellerNameElement) {
            invoice.sellerName = sellerNameElement.textContent?.trim() || '';
          }
          if (sellerTaxElement) {
            invoice.sellerTaxNumber = sellerTaxElement.textContent?.trim() || '';
          }
          
          if (invoice.sellerName && !invoice.sellerAddress) {
            invoice.sellerAddress = 'غير محدد';
          }
          break;
          
        case 'receiverName':
          const buyerNameElement = cell.querySelector('.griCellTitleGray, .griCellTitle');
          const buyerTaxElement = cell.querySelector('.griCellSubTitle');
          
          if (buyerNameElement) {
            invoice.buyerName = buyerNameElement.textContent?.trim() || '';
          }
          if (buyerTaxElement) {
            invoice.buyerTaxNumber = buyerTaxElement.textContent?.trim() || '';
          }
          
          if (invoice.buyerName && !invoice.buyerAddress) {
            invoice.buyerAddress = 'غير محدد';
          }
          break;
          
        case 'submission':
          const submissionLink = cell.querySelector('a.submissionId-link, a');
          if (submissionLink) {
            invoice.submissionId = submissionLink.textContent?.trim() || '';
            invoice.purchaseOrderRef = invoice.submissionId;
          }
          break;
          
        case 'status':
          const validRejectedDiv = cell.querySelector('.horizontal.valid-rejected');
          if (validRejectedDiv) {
            const validStatus = validRejectedDiv.querySelector('.status-Valid');
            const rejectedStatus = validRejectedDiv.querySelector('.status-Rejected');
            if (validStatus && rejectedStatus) {
              invoice.status = `${validStatus.textContent?.trim()} → ${rejectedStatus.textContent?.trim()}`;
            }
          } else {
            const textStatus = cell.querySelector('.textStatus, .griCellTitle, .griCellTitleGray');
            if (textStatus) {
              invoice.status = textStatus.textContent?.trim() || '';
            }
          }
          break;
      }
    });
  }
  
  extractUsingCellPositions(row, invoice) {
    // Method 2: Using cell positions (fallback)
    const cells = row.querySelectorAll('.ms-DetailsRow-cell, td, [role="gridcell"]');
    
    if (cells.length >= 8) {
      // Try to extract based on typical column positions
      if (!invoice.electronicNumber) {
        const firstCell = cells[0];
        const link = firstCell.querySelector('a');
        if (link) {
          invoice.electronicNumber = link.textContent?.trim() || '';
        }
      }
      
      if (!invoice.totalAmount) {
        // Total amount is usually in one of the middle columns
        for (let i = 2; i < Math.min(6, cells.length); i++) {
          const cellText = cells[i].textContent?.trim() || '';
          if (cellText.includes('EGP') || /^\d+[\d,]*\.?\d*$/.test(cellText.replace(/[,٬]/g, ''))) {
            invoice.totalAmount = cellText;
            invoice.totalInvoice = cellText;
            break;
          }
        }
      }
      
      if (!invoice.issueDate) {
        // Date is usually in one of the early columns
        for (let i = 1; i < Math.min(4, cells.length); i++) {
          const cellText = cells[i].textContent?.trim() || '';
          if (cellText.includes('/') && cellText.length >= 8) {
            invoice.issueDate = cellText;
            invoice.submissionDate = cellText;
            break;
          }
        }
      }
    }
  }
  
  extractUsingTextContent(row, invoice) {
    // Method 3: Extract from all text content (last resort)
    const allText = row.textContent || '';
    
    // Extract electronic number pattern
    if (!invoice.electronicNumber) {
      const electronicMatch = allText.match(/[A-Z0-9]{20,30}/);
      if (electronicMatch) {
        invoice.electronicNumber = electronicMatch[0];
      }
    }
    
    // Extract date pattern
    if (!invoice.issueDate) {
      const dateMatch = allText.match(/\d{1,2}\/\d{1,2}\/\d{4}/);
      if (dateMatch) {
        invoice.issueDate = dateMatch[0];
        invoice.submissionDate = dateMatch[0];
      }
    }
    
    // Extract amount pattern
    if (!invoice.totalAmount) {
      const amountMatch = allText.match(/\d+[,٬]?\d*\.?\d*\s*EGP/);
      if (amountMatch) {
        invoice.totalAmount = amountMatch[0];
        invoice.totalInvoice = amountMatch[0];
      }
    }
  }
  
  parseAmount(amountText) {
    if (!amountText) return 0;
    const cleanText = amountText.replace(/[,٬\sEGP]/g, '').replace(/[^\d.]/g, '');
    return parseFloat(cleanText) || 0;
  }
  
  formatAmount(amount) {
    if (!amount || amount === 0) return '0';
    return amount.toLocaleString('en-US', { 
      minimumFractionDigits: 2, 
      maximumFractionDigits: 2 
    });
  }
  
  generateExternalLink(invoice) {
    if (!invoice.electronicNumber) return '';
    
    let shareId = '';
    if (invoice.submissionId && invoice.submissionId.length > 10) {
      shareId = invoice.submissionId;
    } else {
      shareId = invoice.electronicNumber.replace(/[^A-Z0-9]/g, '').substring(0, 26);
    }
    
    return `https://invoicing.eta.gov.eg/documents/${invoice.electronicNumber}/share/${shareId}`;
  }
  
  isValidInvoiceData(invoice) {
    return !!(invoice.electronicNumber || invoice.internalNumber || invoice.totalAmount);
  }
  
  async getAllPagesData(options = {}) {
    try {
      this.isProcessingAllPages = true;
      this.allPagesData = [];
      
      console.log(`ETA Exporter: Starting to load ALL pages. Total invoices to load: ${this.totalCount}`);
      
      // Start from page 1 to ensure we get everything
      if (this.currentPage !== 1) {
        const navigated = await this.navigateToPageDirectly(1);
        if (navigated) {
          await this.waitForPageLoadComplete();
          this.scanForInvoices();
        }
      }
      
      let currentPageNum = 1;
      let processedInvoices = 0;
      let consecutiveEmptyPages = 0;
      const maxConsecutiveEmpty = 5;
      
      // Continue until we've processed all invoices or hit limits
      while (processedInvoices < this.totalCount && consecutiveEmptyPages < maxConsecutiveEmpty) {
        try {
          console.log(`ETA Exporter: Processing page ${currentPageNum}...`);
          
          if (this.progressCallback) {
            this.progressCallback({
              currentPage: currentPageNum,
              totalPages: this.totalPages,
              message: `جاري معالجة الصفحة ${currentPageNum} من ${this.totalPages}... (${processedInvoices}/${this.totalCount} فاتورة)`,
              percentage: this.totalCount > 0 ? (processedInvoices / this.totalCount) * 100 : 0
            });
          }
          
          // Make sure we're on the right page
          if (currentPageNum !== this.currentPage) {
            const navigated = await this.navigateToPageDirectly(currentPageNum);
            if (!navigated) {
              console.warn(`Failed to navigate to page ${currentPageNum}`);
              break;
            }
            await this.waitForPageLoadComplete();
          }
          
          // Scan invoices on this page
          this.scanForInvoices();
          
          if (this.invoiceData.length > 0) {
            consecutiveEmptyPages = 0;
            
            // Add page data to collection with correct serial numbers
            const pageData = this.invoiceData.map(invoice => ({
              ...invoice,
              pageNumber: currentPageNum,
              serialNumber: processedInvoices + invoice.index,
              globalIndex: processedInvoices + invoice.index
            }));
            
            this.allPagesData.push(...pageData);
            processedInvoices += this.invoiceData.length;
            
            console.log(`ETA Exporter: Page ${currentPageNum} processed, collected ${this.invoiceData.length} invoices. Total: ${processedInvoices}/${this.totalCount}`);
          } else {
            consecutiveEmptyPages++;
            console.warn(`ETA Exporter: No invoices found on page ${currentPageNum} (${consecutiveEmptyPages} consecutive empty pages)`);
          }
          
          // Check if we've got all invoices
          if (processedInvoices >= this.totalCount) {
            console.log(`ETA Exporter: Successfully loaded all ${processedInvoices} invoices!`);
            break;
          }
          
          // Try to go to next page
          const hasNextPage = await this.hasNextPage();
          if (!hasNextPage) {
            console.log('ETA Exporter: No more pages available');
            break;
          }
          
          const nextSuccess = await this.navigateToNextPage();
          if (!nextSuccess) {
            console.log('ETA Exporter: Failed to navigate to next page');
            break;
          }
          
          currentPageNum++;
          await this.delay(1000); // Wait between pages
          
        } catch (error) {
          console.error(`Error processing page ${currentPageNum}:`, error);
          consecutiveEmptyPages++;
          
          // Try to continue
          const nextSuccess = await this.navigateToNextPage();
          if (!nextSuccess) {
            break;
          }
          currentPageNum++;
        }
      }
      
      console.log(`ETA Exporter: Completed! Loaded ${this.allPagesData.length} invoices out of ${this.totalCount} total.`);
      
      return {
        success: true,
        data: this.allPagesData,
        totalProcessed: this.allPagesData.length,
        expectedTotal: this.totalCount
      };
      
    } catch (error) {
      console.error('ETA Exporter: Error getting all pages data:', error);
      return { 
        success: false, 
        data: this.allPagesData,
        error: error.message,
        totalProcessed: this.allPagesData.length
      };
    } finally {
      this.isProcessingAllPages = false;
    }
  }
  
  async navigateToPageDirectly(pageNumber) {
    try {
      console.log(`ETA Exporter: Navigating directly to page ${pageNumber}`);
      
      // Look for the specific page button
      const pageButtons = document.querySelectorAll('button, a');
      
      for (const button of pageButtons) {
        const buttonText = button.textContent?.trim();
        if (parseInt(buttonText) === pageNumber) {
          console.log(`ETA Exporter: Clicking page button ${pageNumber}`);
          button.click();
          await this.delay(2000);
          
          // Verify navigation
          await this.waitForPageLoadComplete();
          this.extractPaginationInfo();
          
          if (this.currentPage === pageNumber) {
            return true;
          }
        }
      }
      
      // If direct navigation failed, try sequential navigation
      return await this.navigateToPageSequentially(pageNumber);
      
    } catch (error) {
      console.error(`Error navigating to page ${pageNumber}:`, error);
      return false;
    }
  }
  
  async navigateToPageSequentially(targetPage) {
    let attempts = 0;
    const maxAttempts = Math.abs(targetPage - this.currentPage) + 10;
    
    while (this.currentPage !== targetPage && attempts < maxAttempts) {
      attempts++;
      
      if (this.currentPage < targetPage) {
        const success = await this.navigateToNextPage();
        if (!success) break;
      } else {
        const success = await this.navigateToPreviousPage();
        if (!success) break;
      }
      
      await this.delay(1500);
      await this.waitForPageLoadComplete();
      this.extractPaginationInfo();
      
      console.log(`ETA Exporter: Sequential navigation attempt ${attempts}, current: ${this.currentPage}, target: ${targetPage}`);
    }
    
    return this.currentPage === targetPage;
  }
  
  async hasNextPage() {
    const nextButton = this.findNextButton();
    return nextButton && !nextButton.disabled && !nextButton.getAttribute('disabled');
  }
  
  findNextButton() {
    const nextSelectors = [
      'button[aria-label*="Next"]',
      'button[aria-label*="next"]',
      'button[title*="Next"]',
      'button[title*="next"]',
      'button:has([data-icon-name="ChevronRight"])',
      'button:has([class*="chevron-right"])',
      '.ms-Button:has([data-icon-name="ChevronRight"])'
    ];
    
    for (const selector of nextSelectors) {
      try {
        const button = document.querySelector(selector);
        if (button && !button.disabled) {
          const style = window.getComputedStyle(button);
          if (style.display !== 'none' && style.visibility !== 'hidden') {
            return button;
          }
        }
      } catch (e) {
        // Ignore selector errors
      }
    }
    
    // Fallback: look for buttons with right arrow icons
    const allButtons = document.querySelectorAll('button');
    for (const button of allButtons) {
      if (button.disabled) continue;
      
      const hasRightArrow = button.querySelector('[data-icon-name="ChevronRight"], [class*="chevron-right"], [class*="arrow-right"]');
      if (hasRightArrow) {
        return button;
      }
      
      // Check button text for next indicators
      const text = button.textContent?.toLowerCase() || '';
      if (text.includes('next') || text.includes('التالي') || text === '>') {
        return button;
      }
    }
    
    return null;
  }
  
  async navigateToNextPage() {
    const nextButton = this.findNextButton();
    
    if (nextButton) {
      console.log('ETA Exporter: Clicking next button');
      nextButton.click();
      await this.delay(1500);
      return true;
    }
    
    console.warn('ETA Exporter: No next button found');
    return false;
  }
  
  async navigateToPreviousPage() {
    const prevSelectors = [
      'button[aria-label*="Previous"]',
      'button[aria-label*="previous"]',
      'button[title*="Previous"]',
      'button[title*="previous"]',
      'button:has([data-icon-name="ChevronLeft"])',
      'button:has([class*="chevron-left"])',
      '.ms-Button:has([data-icon-name="ChevronLeft"])'
    ];
    
    for (const selector of prevSelectors) {
      try {
        const button = document.querySelector(selector);
        if (button && !button.disabled) {
          const style = window.getComputedStyle(button);
          if (style.display !== 'none' && style.visibility !== 'hidden') {
            console.log('ETA Exporter: Clicking previous button');
            button.click();
            await this.delay(1500);
            return true;
          }
        }
      } catch (e) {
        // Ignore selector errors
      }
    }
    
    console.warn('ETA Exporter: No previous button found');
    return false;
  }
  
  async waitForPageLoadComplete() {
    console.log('ETA Exporter: Waiting for page load to complete...');
    
    // Wait for loading indicators to disappear
    await this.waitForCondition(() => {
      const loadingIndicators = document.querySelectorAll(
        '.LoadingIndicator, .ms-Spinner, [class*="loading"], [class*="spinner"], .ms-Shimmer'
      );
      const isLoading = Array.from(loadingIndicators).some(el => 
        el.offsetParent !== null && 
        window.getComputedStyle(el).display !== 'none'
      );
      return !isLoading;
    }, 15000);
    
    // Wait for invoice rows to appear
    await this.waitForCondition(() => {
      const rows = this.getVisibleInvoiceRows();
      return rows.length > 0;
    }, 15000);
    
    // Wait for DOM stability
    await this.delay(2000);
    
    console.log('ETA Exporter: Page load completed');
  }
  
  async waitForCondition(condition, timeout = 10000) {
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeout) {
      try {
        if (condition()) {
          return true;
        }
      } catch (error) {
        // Ignore errors in condition check
      }
      await this.delay(500);
    }
    
    console.warn(`ETA Exporter: Condition timeout after ${timeout}ms`);
    return false;
  }
  
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  
  setProgressCallback(callback) {
    this.progressCallback = callback;
  }
  
  async getInvoiceDetails(invoiceId) {
    try {
      const details = await this.extractInvoiceDetailsFromPage(invoiceId);
      return {
        success: true,
        data: details
      };
    } catch (error) {
      console.error('Error getting invoice details:', error);
      return { 
        success: false, 
        data: [],
        error: error.message 
      };
    }
  }
  
  async extractInvoiceDetailsFromPage(invoiceId) {
    const details = [];
    
    try {
      // Look for details table
      const detailsTable = document.querySelector('.ms-DetailsList, [data-automationid="DetailsList"], table');
      
      if (detailsTable) {
        const rows = detailsTable.querySelectorAll('.ms-DetailsRow[role="row"], tr');
        
        rows.forEach((row, index) => {
          const cells = row.querySelectorAll('.ms-DetailsRow-cell, td');
          
          if (cells.length >= 6) {
            const item = {
              itemCode: this.extractCellText(cells[0]) || `ITEM-${index + 1}`,
              description: this.extractCellText(cells[1]) || 'صنف',
              unitCode: this.extractCellText(cells[2]) || 'EA',
              unitName: this.extractCellText(cells[3]) || 'قطعة',
              quantity: this.extractCellText(cells[4]) || '1',
              unitPrice: this.extractCellText(cells[5]) || '0',
              totalValue: this.extractCellText(cells[6]) || '0',
              taxAmount: this.extractCellText(cells[7]) || '0',
              vatAmount: this.extractCellText(cells[8]) || '0'
            };
            
            // Skip header rows
            if (item.description && 
                item.description !== 'اسم الصنف' && 
                item.description !== 'Description' &&
                item.description.trim() !== '') {
              details.push(item);
            }
          }
        });
      }
      
      // If no details found, create a summary item
      if (details.length === 0) {
        const invoice = this.invoiceData.find(inv => inv.electronicNumber === invoiceId);
        if (invoice) {
          details.push({
            itemCode: invoice.electronicNumber || 'INVOICE',
            description: 'إجمالي الفاتورة',
            unitCode: 'EA',
            unitName: 'فاتورة',
            quantity: '1',
            unitPrice: invoice.totalAmount || '0',
            totalValue: invoice.invoiceValue || invoice.totalAmount || '0',
            taxAmount: '0',
            vatAmount: invoice.vatAmount || '0'
          });
        }
      }
      
    } catch (error) {
      console.error('Error extracting invoice details:', error);
    }
    
    return details;
  }
  
  extractCellText(cell) {
    if (!cell) return '';
    
    const textElement = cell.querySelector('.griCellTitle, .griCellTitleGray, .ms-DetailsRow-cellContent') || cell;
    return textElement.textContent?.trim() || '';
  }
  
  getInvoiceData() {
    return {
      invoices: this.invoiceData,
      totalCount: this.totalCount,
      currentPage: this.currentPage,
      totalPages: this.totalPages
    };
  }
  
  cleanup() {
    if (this.observer) {
      this.observer.disconnect();
    }
    if (this.rescanTimeout) {
      clearTimeout(this.rescanTimeout);
    }
  }
}

// Initialize content script
const etaContentScript = new ETAContentScript();

// Listen for messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('ETA Exporter: Received message:', request.action);
  
  switch (request.action) {
    case 'ping':
      sendResponse({ success: true, message: 'Content script is ready' });
      break;
      
    case 'getInvoiceData':
      const data = etaContentScript.getInvoiceData();
      console.log('ETA Exporter: Returning invoice data:', data);
      sendResponse({
        success: true,
        data: data
      });
      break;
      
    case 'getInvoiceDetails':
      etaContentScript.getInvoiceDetails(request.invoiceId)
        .then(result => sendResponse(result))
        .catch(error => sendResponse({ success: false, error: error.message }));
      return true;
      
    case 'getAllPagesData':
      if (request.options && request.options.progressCallback) {
        etaContentScript.setProgressCallback((progress) => {
          chrome.runtime.sendMessage({
            action: 'progressUpdate',
            progress: progress
          }).catch(() => {
            // Ignore errors if popup is closed
          });
        });
      }
      
      etaContentScript.getAllPagesData(request.options)
        .then(result => {
          console.log('ETA Exporter: All pages data result:', result);
          sendResponse(result);
        })
        .catch(error => {
          console.error('ETA Exporter: Error in getAllPagesData:', error);
          sendResponse({ success: false, error: error.message });
        });
      return true;
      
    case 'rescanPage':
      etaContentScript.scanForInvoices();
      sendResponse({
        success: true,
        data: etaContentScript.getInvoiceData()
      });
      break;
      
    default:
      sendResponse({ success: false, error: 'Unknown action' });
  }
  
  return true;
});

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
  etaContentScript.cleanup();
});

console.log('ETA Exporter: Content script loaded successfully');