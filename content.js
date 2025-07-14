// Enhanced Content script for ETA Invoice Exporter - Fixed All Pages Download
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
    this.pageLoadTimeout = 10000; // 10 seconds timeout
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
      // Extract total count more comprehensively
      this.totalCount = this.extractTotalCount();
      
      // Extract current page
      this.currentPage = this.extractCurrentPage();
      
      // Extract total pages more accurately
      this.totalPages = this.extractTotalPages();
      
      // Ensure we have valid values
      this.currentPage = Math.max(this.currentPage, 1);
      this.totalPages = Math.max(this.totalPages, this.currentPage);
      this.totalCount = Math.max(this.totalCount, this.invoiceData.length);
      
      console.log(`ETA Exporter: Page ${this.currentPage} of ${this.totalPages}, Total: ${this.totalCount} invoices`);
      
    } catch (error) {
      console.warn('ETA Exporter: Error extracting pagination info:', error);
      // Set defaults
      this.currentPage = 1;
      this.totalPages = this.findMaxPageNumber() || 1;
      this.totalCount = this.invoiceData.length;
    }
  }
  
  extractTotalCount() {
    // Method 1: Look for total count in various UI elements
    const totalSelectors = [
      '.eta-pagination-totalrecordCount-label',
      '[class*="pagination"] [class*="total"]',
      '[class*="record"] [class*="count"]',
      '.ms-CommandBar-primaryCommand',
      '.ms-Label',
      '[class*="total"]',
      '[class*="count"]'
    ];
    
    for (const selector of totalSelectors) {
      const elements = document.querySelectorAll(selector);
      for (const element of elements) {
        const text = element.textContent || '';
        // Look for patterns like "النتائج: 299" or "299 نتيجة" or "Total: 299"
        const patterns = [
          /النتائج:\s*(\d+)/i,
          /(\d+)\s*نتيجة/i,
          /Total:\s*(\d+)/i,
          /(\d+)\s*items?/i,
          /(\d+)\s*results?/i,
          /من\s*(\d+)/i,
          /of\s*(\d+)/i
        ];
        
        for (const pattern of patterns) {
          const match = text.match(pattern);
          if (match) {
            const count = parseInt(match[1]);
            if (count > 0) {
              console.log(`ETA Exporter: Found total count ${count} using pattern ${pattern} in text: "${text}"`);
              return count;
            }
          }
        }
      }
    }
    
    // Method 2: Look in pagination info text
    const paginationTexts = document.querySelectorAll('[class*="pagination"], [class*="pager"], .ms-CommandBar');
    for (const element of paginationTexts) {
      const text = element.textContent || '';
      const match = text.match(/(\d+)\s*-\s*(\d+)\s*من\s*(\d+)|(\d+)\s*-\s*(\d+)\s*of\s*(\d+)/i);
      if (match) {
        const total = parseInt(match[3] || match[6]);
        if (total > 0) {
          console.log(`ETA Exporter: Found total count ${total} from pagination text: "${text}"`);
          return total;
        }
      }
    }
    
    return 0;
  }
  
  extractCurrentPage() {
    const pageSelectors = [
      '.eta-pageNumber.is-checked',
      '[class*="page"][class*="current"]',
      '[class*="active"][class*="page"]',
      '.ms-Button--primary[aria-pressed="true"]',
      '[aria-pressed="true"]',
      '.is-selected',
      '.selected'
    ];
    
    for (const selector of pageSelectors) {
      const currentPageBtn = document.querySelector(selector);
      if (currentPageBtn) {
        const pageLabel = currentPageBtn.querySelector('.ms-Button-label, [class*="label"], [class*="text"]') || currentPageBtn;
        const pageText = pageLabel.textContent.trim();
        const pageNum = parseInt(pageText);
        if (!isNaN(pageNum) && pageNum > 0) {
          return pageNum;
        }
      }
    }
    
    return 1;
  }
  
  extractTotalPages() {
    // Method 1: Look for explicit total pages indicator
    const paginationTexts = document.querySelectorAll('[class*="pagination"], [class*="pager"], .ms-CommandBar');
    for (const element of paginationTexts) {
      const text = element.textContent || '';
      // Look for patterns like "صفحة 1 من 15" or "Page 1 of 15"
      const match = text.match(/صفحة\s*\d+\s*من\s*(\d+)|page\s*\d+\s*of\s*(\d+)/i);
      if (match) {
        const totalPages = parseInt(match[1] || match[2]);
        if (totalPages > 0) {
          console.log(`ETA Exporter: Found total pages ${totalPages} from text: "${text}"`);
          return totalPages;
        }
      }
    }
    
    // Method 2: Find the highest page number in pagination buttons
    return this.findMaxPageNumber();
  }
  
  findMaxPageNumber() {
    const pageButtons = document.querySelectorAll(
      '.eta-pageNumber, [class*="pageNumber"], .ms-Button[aria-label*="Page"], [class*="page-"], .ms-Button'
    );
    
    let maxPage = 1;
    
    pageButtons.forEach(btn => {
      const label = btn.querySelector('.ms-Button-label, [class*="label"], [class*="text"]') || btn;
      const buttonText = label.textContent.trim();
      const pageNum = parseInt(buttonText);
      
      if (!isNaN(pageNum) && pageNum > maxPage) {
        maxPage = pageNum;
      }
      
      // Also check aria-label for page numbers
      const ariaLabel = btn.getAttribute('aria-label') || '';
      const ariaMatch = ariaLabel.match(/page\s*(\d+)|صفحة\s*(\d+)/i);
      if (ariaMatch) {
        const ariaPageNum = parseInt(ariaMatch[1] || ariaMatch[2]);
        if (!isNaN(ariaPageNum) && ariaPageNum > maxPage) {
          maxPage = ariaPageNum;
        }
      }
    });
    
    // Also look for "..." or ellipsis indicators which might suggest more pages
    const ellipsisButtons = document.querySelectorAll('[class*="ellipsis"], .ms-Button');
    ellipsisButtons.forEach(btn => {
      if (btn.textContent.includes('...') || btn.textContent.includes('…')) {
        // If we see ellipsis, there are likely more pages than we can see
        // We'll discover them during navigation
        console.log('ETA Exporter: Found ellipsis in pagination, more pages may exist');
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
      
      console.log(`ETA Exporter: Starting to load all pages. Current: ${this.currentPage}, Total: ${this.totalPages}`);
      
      // Start from page 1 to ensure we get everything
      if (this.currentPage !== 1) {
        const navigated = await this.navigateToPageReliably(1);
        if (navigated) {
          await this.waitForPageLoadComplete();
          this.extractPaginationInfo();
        }
      }
      
      // Get current page data
      this.scanForInvoices();
      
      // Use dynamic page discovery instead of relying on totalPages
      let currentPageNum = 1;
      let hasMorePages = true;
      let consecutiveEmptyPages = 0;
      const maxConsecutiveEmpty = 3; // Stop after 3 consecutive empty pages
      const maxPages = 1000; // Safety limit
      
      while (hasMorePages && currentPageNum <= maxPages && consecutiveEmptyPages < maxConsecutiveEmpty) {
        try {
          if (this.progressCallback) {
            this.progressCallback({
              currentPage: currentPageNum,
              totalPages: Math.max(this.totalPages, currentPageNum),
              message: `جاري معالجة الصفحة ${currentPageNum}...`,
              percentage: this.totalPages > 0 ? (currentPageNum / this.totalPages) * 100 : 0
            });
          }
          
          // Navigate to page if not already there
          if (currentPageNum !== this.currentPage) {
            const navigated = await this.navigateToPageReliably(currentPageNum);
            if (!navigated) {
              console.warn(`Failed to navigate to page ${currentPageNum}, trying next page navigation...`);
              
              // Try to go to next page instead
              const nextSuccess = await this.navigateToNextPage();
              if (!nextSuccess) {
                console.log('No more pages available, stopping...');
                break;
              }
              await this.waitForPageLoadComplete();
              this.extractPaginationInfo();
            }
          }
          
          // Wait for page to load completely
          await this.waitForPageLoadComplete();
          
          // Scan invoices on this page
          this.scanForInvoices();
          
          if (this.invoiceData.length > 0) {
            consecutiveEmptyPages = 0; // Reset counter
            
            // Add page data to collection
            const pageData = this.invoiceData.map(invoice => ({
              ...invoice,
              pageNumber: currentPageNum,
              serialNumber: this.allPagesData.length + invoice.index
            }));
            
            this.allPagesData.push(...pageData);
            console.log(`ETA Exporter: Page ${currentPageNum} processed, collected ${this.invoiceData.length} invoices. Total so far: ${this.allPagesData.length}`);
          } else {
            consecutiveEmptyPages++;
            console.warn(`ETA Exporter: No invoices found on page ${currentPageNum} (${consecutiveEmptyPages} consecutive empty pages)`);
          }
          
          // Check if we can go to next page
          const canGoNext = await this.canNavigateToNextPage();
          if (!canGoNext) {
            console.log('ETA Exporter: No more pages available, stopping...');
            hasMorePages = false;
            break;
          }
          
          // Try to navigate to next page
          const nextSuccess = await this.navigateToNextPage();
          if (!nextSuccess) {
            console.log('ETA Exporter: Failed to navigate to next page, stopping...');
            hasMorePages = false;
            break;
          }
          
          currentPageNum++;
          
          // Update our understanding of total pages
          this.totalPages = Math.max(this.totalPages, currentPageNum);
          
          // Small delay between pages for stability
          await this.delay(800);
          
        } catch (error) {
          console.error(`Error processing page ${currentPageNum}:`, error);
          consecutiveEmptyPages++;
          
          // Try to continue to next page
          const nextSuccess = await this.navigateToNextPage();
          if (!nextSuccess) {
            break;
          }
          currentPageNum++;
        }
      }
      
      console.log(`ETA Exporter: Completed loading all pages. Total invoices: ${this.allPagesData.length}`);
      
      return {
        success: true,
        data: this.allPagesData,
        totalProcessed: this.allPagesData.length
      };
      
    } catch (error) {
      console.error('ETA Exporter: Error getting all pages data:', error);
      return { 
        success: false, 
        data: this.allPagesData,
        error: error.message 
      };
    } finally {
      this.isProcessingAllPages = false;
    }
  }
  
  async canNavigateToNextPage() {
    const nextSelectors = [
      '[data-icon-name="ChevronRight"]:not([disabled])',
      '[data-icon-name="Next"]:not([disabled])',
      '[aria-label*="Next"]:not([disabled])',
      '[aria-label*="التالي"]:not([disabled])',
      '.ms-Button[aria-label*="next"]:not([disabled])'
    ];
    
    for (const selector of nextSelectors) {
      const nextButton = document.querySelector(selector)?.closest('button');
      if (nextButton && !nextButton.disabled && !nextButton.getAttribute('disabled')) {
        const style = window.getComputedStyle(nextButton);
        if (style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0') {
          return true;
        }
      }
    }
    
    return false;
  }
  
  async navigateToPageReliably(pageNumber) {
    try {
      console.log(`ETA Exporter: Navigating to page ${pageNumber}`);
      
      // Method 1: Direct page button click
      const pageButtons = document.querySelectorAll('.eta-pageNumber, [class*="pageNumber"], .ms-Button[aria-label*="Page"]');
      
      for (const btn of pageButtons) {
        const label = btn.querySelector('.ms-Button-label, [class*="label"]') || btn;
        const buttonText = label.textContent.trim();
        
        if (parseInt(buttonText) === pageNumber) {
          console.log(`ETA Exporter: Clicking page button ${pageNumber}`);
          btn.click();
          await this.delay(1500);
          
          // Verify navigation
          await this.waitForPageLoadComplete();
          this.extractPaginationInfo();
          
          if (this.currentPage === pageNumber) {
            return true;
          }
        }
      }
      
      // Method 2: Sequential navigation
      const targetPage = pageNumber;
      let attempts = 0;
      const maxAttempts = Math.abs(targetPage - this.currentPage) + 10;
      
      while (this.currentPage !== targetPage && attempts < maxAttempts) {
        attempts++;
        
        if (this.currentPage < targetPage) {
          // Go to next page
          const success = await this.navigateToNextPage();
          if (!success) break;
        } else {
          // Go to previous page
          const success = await this.navigateToPreviousPage();
          if (!success) break;
        }
        
        await this.delay(1200);
        await this.waitForPageLoadComplete();
        this.extractPaginationInfo();
        
        console.log(`ETA Exporter: Navigation attempt ${attempts}, current page: ${this.currentPage}, target: ${targetPage}`);
      }
      
      return this.currentPage === pageNumber;
      
    } catch (error) {
      console.error(`Error navigating to page ${pageNumber}:`, error);
      return false;
    }
  }
  
  async navigateToNextPage() {
    const nextSelectors = [
      '[data-icon-name="ChevronRight"]:not([disabled])',
      '[data-icon-name="Next"]:not([disabled])',
      '[aria-label*="Next"]:not([disabled])',
      '[aria-label*="التالي"]:not([disabled])',
      '.ms-Button[aria-label*="next"]:not([disabled])'
    ];
    
    for (const selector of nextSelectors) {
      const nextButton = document.querySelector(selector)?.closest('button');
      if (nextButton && !nextButton.disabled && !nextButton.getAttribute('disabled')) {
        const style = window.getComputedStyle(nextButton);
        if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
          continue;
        }
        
        console.log('ETA Exporter: Clicking next button');
        nextButton.click();
        await this.delay(800);
        return true;
      }
    }
    
    console.warn('ETA Exporter: No enabled next button found');
    return false;
  }
  
  async navigateToPreviousPage() {
    const prevSelectors = [
      '[data-icon-name="ChevronLeft"]:not([disabled])',
      '[data-icon-name="Previous"]:not([disabled])',
      '[aria-label*="Previous"]:not([disabled])',
      '[aria-label*="السابق"]:not([disabled])',
      '.ms-Button[aria-label*="previous"]:not([disabled])'
    ];
    
    for (const selector of prevSelectors) {
      const prevButton = document.querySelector(selector)?.closest('button');
      if (prevButton && !prevButton.disabled && !prevButton.getAttribute('disabled')) {
        const style = window.getComputedStyle(prevButton);
        if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
          continue;
        }
        
        console.log('ETA Exporter: Clicking previous button');
        prevButton.click();
        await this.delay(800);
        return true;
      }
    }
    
    console.warn('ETA Exporter: No enabled previous button found');
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
    }, 10000);
    
    // Wait for invoice rows to appear
    await this.waitForCondition(() => {
      const rows = this.getVisibleInvoiceRows();
      return rows.length > 0;
    }, 10000);
    
    // Wait for DOM stability
    await this.delay(1500);
    
    console.log('ETA Exporter: Page load completed');
  }
  
  async waitForCondition(condition, timeout = 5000) {
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeout) {
      try {
        if (condition()) {
          return true;
        }
      } catch (error) {
        // Ignore errors in condition check
      }
      await this.delay(300);
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