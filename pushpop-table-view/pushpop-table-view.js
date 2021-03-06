;'use strict';

// The base Pushpop object.
var Pushpop = window['Pushpop'] || {};

/**
  Creates a new TableView.
  @param {HTMLUListElement} element The UL element to initialize as a new TableView.
  @constructor
*/
Pushpop.TableView = function TableView(element) {
  if (!element) return;
  
  var $element = this.$element = $(element);
  element = this.element = $element[0];
  
  var tableView = element.tableView;
  if (tableView) return tableView;
  
  var self = element.tableView = this;
  
  // Make sure this table view has a scroll view, otherwise, stop initialization.
  var view = this.getView();
  if (!view) return;
  
  var scrollView = this.scrollView = view.getScrollView();
  if (!scrollView) return;
  
  // Determine if a search bar should be added to this table view.
  var containsSearchBar = $element.attr('data-contains-search-bar') || 'false';
  if ((containsSearchBar = containsSearchBar !== 'false')) this.setSearchBar(new Pushpop.TableViewSearchBar(this));
  
  // Set up the loading message element for this table view.
  var $loadingMessageElement = this._$loadingMessageElement = $('<div class="pp-table-view-loading-message pp-hidden"/>').insertBefore(scrollView.$content);
  var $loadingSpinnerElement = this._$loadingSpinnerElement = $('<div class="pp-table-view-loading-spinner"/>');
  var loadingSpinner = this._loadingSpinner = new Spinner({
    lines: 12,      // The number of lines to draw
    length: 6,      // The length of each line
    width: 4,       // The line thickness
    radius: 8,      // The radius of the inner circle
    corners: 1,     // Corner roundness (0..1)
    color: '#111',  // #rgb or #rrggbb
    speed: 1,       // Rounds per second
    trail: 60,      // Afterglow percentage
    hwaccel: true   // Whether to use hardware acceleration
  }).spin($loadingSpinnerElement[0]);
  
  this.setLoadingMessageHtml(this.getLoadingMessageHtml());
  
  // Instantiate instance variables.
  this._renderedCells = [];
  this._reusableCells = {};
  this._selectedRowIndexes = [];
  
  // Determine if this is running on a device with touch support.
  var isTouchSupported = !!('ontouchstart' in window);
  
  // Handle virtual rendering of table view cells when the table view is scrolled.
  scrollView.$bind('scroll', function(evt) {
    if (self.getDrawing()) return;
    
    var minimumScrollPositionThreshold = self.getMinimumScrollPositionThreshold();
    var maximumScrollPositionThreshold = self.getMaximumScrollPositionThreshold();
    var scrollPosition = self.getScrollPosition();
    
    if ((minimumScrollPositionThreshold !== -1 && scrollPosition <  minimumScrollPositionThreshold) ||
        (maximumScrollPositionThreshold !== -1 && scrollPosition >= maximumScrollPositionThreshold)) self.draw();
  });
  
  // Force a redraw when the DidScrollToTop event occurs on the scroll view.
  scrollView.$bind(ScrollKit.ScrollView.EventType.DidScrollToTop, function(evt) { self.draw(); });
  
  // Handle mouse/touch events to allow the user to tap accessory buttons.
  var isPendingAccessoryButtonTap = false;

  $element.delegate('.pp-table-view-cell-accessory', isTouchSupported ? 'touchstart' : 'mousedown', function(evt) {
    isPendingAccessoryButtonTap = true;
  });
  $element.delegate('.pp-table-view-cell-accessory', isTouchSupported ? 'touchend' : 'mouseup', function(evt) {
    if (!isPendingAccessoryButtonTap) return;
    isPendingAccessoryButtonTap = false;
    
    var tableViewCell = $(this).parent()[0].tableViewCell;
    if (!tableViewCell) return;
    
    var index = tableViewCell.getIndex();
    
    // Trigger the AccessoryButtonTappedForRowWithIndex event on this and all parent table view elements.
    self.triggerEventOnParentTableViews($.Event(Pushpop.TableView.EventType.AccessoryButtonTappedForRowWithIndex, {
      tableView: self,
      tableViewCell: tableViewCell,
      index: index,
      item: self.getDataSource().getFilteredItemAtIndex(index),
      element: this
    }), true);
  });
  
  // Handle mouse/touch events to allow the user to tap editing accessory buttons.
  var isPendingEditingAccessoryButtonTap = false;

  $element.delegate('.pp-table-view-cell-editing-accessory', isTouchSupported ? 'touchstart' : 'mousedown', function(evt) {
    isPendingEditingAccessoryButtonTap = true;
  });
  $element.delegate('.pp-table-view-cell-editing-accessory', isTouchSupported ? 'touchend' : 'mouseup', function(evt) {
    if (!isPendingEditingAccessoryButtonTap) return;
    isPendingEditingAccessoryButtonTap = false;
    
    var tableViewCell = $(this).parent()[0].tableViewCell;
    if (!tableViewCell) return;
    
    var index = tableViewCell.getIndex();
    
    // Trigger the EditingAccessoryButtonTappedForRowWithIndex event on this and all parent table view elements.
    self.triggerEventOnParentTableViews($.Event(Pushpop.TableView.EventType.EditingAccessoryButtonTappedForRowWithIndex, {
      tableView: self,
      tableViewCell: tableViewCell,
      index: index,
      item: self.getDataSource().getFilteredItemAtIndex(index),
      element: this
    }), true);
  });
  
  // Handle mouse/touch events to allow the user to make row selections.
  var isPendingSelection = false, selectionTimeout = null;
  
  $element.delegate('li', isTouchSupported ? 'touchstart' : 'mousedown', function(evt) {
    var tableViewCell = this.tableViewCell;
    if (!tableViewCell) return;
    
    // Don't allow row to be selected if an accessory button is pending a tap.
    if (isPendingAccessoryButtonTap || isPendingEditingAccessoryButtonTap) return;
    
    isPendingSelection = true;
    
    selectionTimeout = window.setTimeout(function() {
      if (!isPendingSelection) return;
      isPendingSelection = false;
      
      tableViewCell.didReceiveTap();
      self.selectRowAtIndex(tableViewCell.getIndex());
    }, self.getSelectionTimeoutDuration());
  });
  $element.delegate('li', isTouchSupported ? 'touchend' : 'mouseup', function(evt) {
    var tableViewCell = this.tableViewCell;
    if (!tableViewCell || !isPendingSelection) return;
    
    isPendingSelection = false;
    
    window.clearTimeout(selectionTimeout);
    
    tableViewCell.didReceiveTap();
    self.selectRowAtIndex(this.tableViewCell.getIndex());
  });
  
  // Cancel any pending accessory, editing accessory or row selections if a mouse or touch move occurs.
  $element.bind(isTouchSupported ? 'touchmove' : 'mousemove', function(evt) {
    if (isPendingAccessoryButtonTap) isPendingAccessoryButtonTap = false;
    else if (isPendingEditingAccessoryButtonTap) isPendingEditingAccessoryButtonTap = false;
    else if (isPendingSelection) {
      isPendingSelection = false;
      window.clearTimeout(selectionTimeout);
    }
  });
  
  // Create a new data source from a data set URL.
  var dataSetUrl = $element.attr('data-set-url');
  if (dataSetUrl) $.getJSON(dataSetUrl, function(dataSet) {
    $element.html(null);
    self.setDataSource(new Pushpop.TableViewDataSource(dataSet));
  });
  
  // Create a new data source from existing <li/> elements.
  else (function(self, $element) {
    var dataSet = [];
    var dashAlpha = /-([a-z]|[0-9])/ig;
    var camelCase = function(string) { return string.replace(dashAlpha, function(all, letter) { return (letter + '').toUpperCase(); }); };
    
    $element.children('li').each(function(index, element) {
      var data = { title: $(element).html() };
      var attributes = element.attributes;
      var attribute, attributeName, attributeValue;
      for (var i = 0, length = attributes.length; i < length; i++) {
        attribute = attributes[i];
        attributeName = attribute.name;
        attributeValue = attribute.value;
        
        try { attributeValue = JSON.parse(attributeValue); } catch (ex) {}
        
        if (attributeName.indexOf('data-') === 0) data[camelCase(attributeName.substring(5))] = attributeValue;
      }
      
      data.reuseIdentifier = data.reuseIdentifier || 'pp-table-view-cell-default';
    
      dataSet.push(data);
    });
    
    $element.html(null);
    self.setDataSource(new Pushpop.TableViewDataSource(dataSet));
  })(self, $element);
};

/**
  Event types for Pushpop.TableView.
*/
Pushpop.TableView.EventType = {
  DidSelectRowAtIndex: 'Pushpop:TableView:DidSelectRowAtIndex',
  DidDeselectRowAtIndex: 'Pushpop:TableView:DidDeselectRowAtIndex',
  AccessoryButtonTappedForRowWithIndex: 'Pushpop:TableView:AccessoryButtonTappedForRowWithIndex',
  EditingAccessoryButtonTappedForRowWithIndex: 'Pushpop:TableView:EditingAccessoryButtonTappedForRowWithIndex',
  DidReloadData: 'Pushpop:TableView:DidReloadData',
  DidDrawRowsWithIndexes: 'Pushpop:TableView:DidDrawRowsWithIndexes',
  DidChangeValueForItemInDataSource: 'Pushpop:TableView:DidChangeValueForItemInDataSource',
  DidChangeDataSource: 'Pushpop:TableView:DidChangeDataSource'
};

Pushpop.TableView._reusableCellPrototypes = {};
Pushpop.TableView.getReusableCellPrototypes = function() {
  var reusableCellPrototypes = Pushpop.TableView._reusableCellPrototypes, items = [];
  for (var reusableCellPrototype in reusableCellPrototypes) items.push(reusableCellPrototypes[reusableCellPrototype]);
  return items;
};

Pushpop.TableView.getReusableCellPrototypeWithIdentifier = function(reuseIdentifier) { return Pushpop.TableView._reusableCellPrototypes[reuseIdentifier]; };

Pushpop.TableView.registerReusableCellPrototype = function(cellPrototype) {
  var reuseIdentifier;
  if (!cellPrototype || !(reuseIdentifier = cellPrototype.getReuseIdentifier())) return;
  Pushpop.TableView._reusableCellPrototypes[reuseIdentifier] = cellPrototype;
};

Pushpop.TableView.prototype = {
  constructor: Pushpop.TableView,
  
  element: null,
  $element: null,
  
  scrollView: null,
  
  /**
  
  */
  getVisibleHeight: function() { return this.scrollView.getSize().height; },
  
  /**
  
  */
  getTotalHeight: function() { return this.getDataSource().getNumberOfRows() * this.getRowHeight(); },
  
  /**
  
  */
  getScrollPosition: function() { return this.scrollView.getScrollPosition().y; },
  
  _minimumScrollPositionThreshold: -1,
  
  /**
  
  */
  getMinimumScrollPositionThreshold: function() { return this._minimumScrollPositionThreshold; },
  
  _maximumScrollPositionThreshold: -1,
  
  /**
  
  */
  getMaximumScrollPositionThreshold: function() { return this._maximumScrollPositionThreshold; },
  
  /**
  
  */
  getMinimumVisibleRowIndex: function() { return Math.min(Math.floor(this.getScrollPosition() / this.getRowHeight()), this.getDataSource().getNumberOfRows() - 1); },
  
  /**
  
  */
  getMaximumVisibleRowIndex: function() { return Math.min(this.getMinimumVisibleRowIndex() + this.getNumberOfVisibleRows(), this.getDataSource().getNumberOfRows()) - 1; },
  
  /**
  
  */
  getNumberOfVisibleRows: function() { return Math.min(Math.ceil(this.getVisibleHeight() / this.getRowHeight()), this.getDataSource().getNumberOfRows()); },
  
  _renderedCells: null, // []
  
  /**
  
  */
  getRenderedCells: function() { return this._renderedCells; },
  
  /**
  
  */
  getRenderedCellAtIndex: function(index) {
    var renderedCells = this.getRenderedCells();
    for (var i = 0, length = renderedCells.length, renderedCell; i < length; i++) if ((renderedCell = renderedCells[i]).getIndex() === index) return renderedCell;
    return null;
  },
  
  _minimumRenderedRowIndex: -1,
  
  /**
  
  */
  getMinimumRenderedRowIndex: function() { return this._minimumRenderedRowIndex; },
  
  _maximumRenderedRowIndex: -1,
  
  /**
  
  */
  getMaximumRenderedRowIndex: function() { return this._maximumRenderedRowIndex; },
  
  _reusableCells: null, // {}
  
  /**
  
  */
  getReusableCells: function() { return this._reusableCells; },
  
  /**
  
  */
  getReusableCellsWithIdentifier: function(reuseIdentifier) {
    var reusableCells = this.getReusableCells();
    return reusableCells[reuseIdentifier] || (reusableCells[reuseIdentifier] = []);
  },
  
  /**
    Returns a new or recycled TableViewCell with the specified reuse identifier.
    @description This method will first attempt to reuse a recycled TableViewCell
    with the specified reuse identifier. If no recycled TableViewCells with that
    reuse identifier are available, a new one will be instantiated and returned.
    The TableViewCell that is returned is always added to the |renderedCells| array.
    @type Pushpop.TableViewCell
  */
  dequeueReusableCellWithIdentifier: function(reuseIdentifier) {
    var renderedCells = this.getRenderedCells();
    var reusableCells = this.getReusableCellsWithIdentifier(reuseIdentifier);
    
    var cell = null, cellPrototype = null;
    
    if (reusableCells.length > 0) {
      cell = reusableCells.pop();
    } else {
      cellPrototype = Pushpop.TableView.getReusableCellPrototypeWithIdentifier(reuseIdentifier);
      cell = (cellPrototype) ? new cellPrototype.constructor(reuseIdentifier) : new Pushpop.TableViewCell(reuseIdentifier);
    }
    
    renderedCells.push(cell);
    cell.tableView = this;
    
    return cell;
  },
  
  _drawing: false,
  
  getDrawing: function() { return this._drawing; },
  
  /**
  
  */
  draw: function() {
    if (this._drawing) return;
    this._drawing = true;
    
    var dataSource = this.getDataSource();
    
    var minimumVisibleRowIndex = this.getMinimumVisibleRowIndex();
    var maximumVisibleRowIndex = this.getMaximumVisibleRowIndex();
    
    var numberOfRows = dataSource.getNumberOfRows();
    var numberOfVisibleRows = this.getNumberOfVisibleRows();
    var numberOfLeadingRows = Math.min(numberOfVisibleRows, minimumVisibleRowIndex);
    var numberOfTrailingRows = Math.min(numberOfVisibleRows, numberOfRows - maximumVisibleRowIndex - 1);
    
    var lastMinimumRenderedRowIndex = this.getMinimumRenderedRowIndex();
    var lastMaximumRenderedRowIndex = this.getMaximumRenderedRowIndex();
    
    var minimumRenderedRowIndex = this._minimumRenderedRowIndex = minimumVisibleRowIndex - numberOfLeadingRows;
    var maximumRenderedRowIndex = this._maximumRenderedRowIndex = maximumVisibleRowIndex + numberOfTrailingRows;
    
    var lastMinimumScrollPositionThreshold = this._minimumScrollPositionThreshold;
    var lastMaximumScrollPositionThreshold = this._maximumScrollPositionThreshold;
    
    var scrollPosition = this.getScrollPosition();
    
    var visibleHeight = this.getVisibleHeight();
    var totalHeight = this.getTotalHeight();
    var rowHeight = this.getRowHeight();
    
    var scrollView = this.scrollView;
    var lastScrollViewMargin = scrollView.getMargin();
    var scrollViewMarginTop = minimumRenderedRowIndex * rowHeight;
    var scrollViewMarginBottom = (numberOfRows - maximumRenderedRowIndex - 1) * rowHeight;
    
    scrollView.setMargin(scrollViewMarginTop, lastScrollViewMargin.right, scrollViewMarginBottom, lastScrollViewMargin.left);
    
    var $element = this.$element;
    var minimumRowIndexToRender, maximumRowIndexToRender;
    var minimumRowIndexToRemove, maximumRowIndexToRemove;
    var i, cellToAdd, renderedCellToRemove;
    
    // Render higher-indexed rows.
    if (minimumRenderedRowIndex > lastMinimumRenderedRowIndex || maximumRenderedRowIndex > lastMaximumRenderedRowIndex) {
      minimumRowIndexToRender = lastMaximumRenderedRowIndex + 1;
      maximumRowIndexToRender = maximumRenderedRowIndex;
      minimumRowIndexToRemove = lastMinimumRenderedRowIndex;
      maximumRowIndexToRemove = minimumRenderedRowIndex - 1;
      
      for (i = minimumRowIndexToRender; i <= maximumRowIndexToRender; i++) {
        cellToAdd = dataSource.getCellForRowAtIndex(this, i);
        cellToAdd.setSelected(this.isRowSelectedAtIndex(i));
        $element.append(cellToAdd.$element);
      }
    }
    
    // Render lower-indexed rows.
    else if (minimumRenderedRowIndex < lastMinimumRenderedRowIndex || maximumRenderedRowIndex < lastMaximumRenderedRowIndex) {
      minimumRowIndexToRender = minimumRenderedRowIndex;
      maximumRowIndexToRender = lastMinimumRenderedRowIndex - 1;
      minimumRowIndexToRemove = maximumRenderedRowIndex + 1;
      maximumRowIndexToRemove = lastMaximumRenderedRowIndex;
      
      for (i = maximumRowIndexToRender; i >= minimumRowIndexToRender; i--) {
        cellToAdd = dataSource.getCellForRowAtIndex(this, i);
        cellToAdd.setSelected(this.isRowSelectedAtIndex(i));
        $element.prepend(cellToAdd.$element);
      }
    }

    for (i = minimumRowIndexToRemove; i <= maximumRowIndexToRemove; i++) if ((renderedCellToRemove = this.getRenderedCellAtIndex(i))) renderedCellToRemove.prepareForReuse();
  
    var minimumScrollPositionThreshold = this._minimumScrollPositionThreshold = (minimumRenderedRowIndex > 0) ? scrollPosition - visibleHeight : -1;
    var maximumScrollPositionThreshold = this._maximumScrollPositionThreshold = (maximumRenderedRowIndex < numberOfRows - 1) ? scrollPosition + visibleHeight : -1;
    
    // console.log('Minimum Visible Index: ' + minimumVisibleRowIndex + ', Maximum Visible Index: ' + maximumVisibleRowIndex);
    // console.log('Visible Rows: ' + numberOfVisibleRows + ', Leading Rows: ' + numberOfLeadingRows + ', Trailing Rows: ' + numberOfTrailingRows);
    // console.log(lastMinimumRenderedRowIndex + ' -> ' + minimumRenderedRowIndex + ', ' + lastMaximumRenderedRowIndex + ' -> ' + maximumRenderedRowIndex);
    // console.log('Row Indexes To Render: ' + minimumRowIndexToRender + ' - ' + maximumRowIndexToRender);
    // console.log('Row Indexes To Remove: ' + minimumRowIndexToRemove + ' - ' + maximumRowIndexToRemove);
    // console.log('================================================================');
    
    this._drawing = false;
    
    this.$trigger($.Event(Pushpop.TableView.EventType.DidDrawRowsWithIndexes, {
      tableView: this,
      dataSource: dataSource,
      minimumRowIndex: minimumRenderedRowIndex,
      maximumRowIndex: maximumRenderedRowIndex
    }));
  },
  
  /**
  
  */
  reloadData: function() {
    var scrollView = this.scrollView;
    var scrollPosition = $.extend({}, scrollView.getScrollPosition());
    var renderedCells = this.getRenderedCells();
    var renderedCellsToReuse = [];
    
    var i, length;
    for (i = 0, length = renderedCells.length; i < length; i++) renderedCellsToReuse.push(renderedCells[i]);
    for (i = 0, length = renderedCellsToReuse.length; i < length; i++) renderedCellsToReuse[i].prepareForReuse();
    
    this._minimumScrollPositionThreshold = -1;
    this._maximumScrollPositionThreshold = -1;
    this._minimumRenderedRowIndex = -1;
    this._maximumRenderedRowIndex = -1;
    
    this.draw();
    
    scrollView.setScrollPosition(scrollPosition.x, scrollPosition.y);
  },
  
  _$loadingMessageElement: null,
  
  _loadingMessageHtml: 'Loading...',
  
  /**
  
  */
  getLoadingMessageHtml: function() { return this._loadingMessageHtml; },
  
  /**
  
  */
  setLoadingMessageHtml: function(loadingMessageHtml) { this._$loadingMessageElement.html(this._loadingMessageHtml = loadingMessageHtml).append(this._$loadingSpinnerElement); },
  
  _$loadingSpinnerElement: null,
  
  _loadingSpinner: null,
  
  /**
  
  */
  getLoadingSpinner: function() { return this._loadingSpinner; },
  
  _loadingMessageHidden: true,
  
  /**
  
  */
  getLoadingMessageHidden: function() { return this._loadingMessageHidden; },
  
  /**
  
  */
  setLoadingMessageHidden: function(loadingMessageHidden) {
    if ((this._loadingMessageHidden = loadingMessageHidden)) {
      this._$loadingMessageElement.addClass('pp-hidden');
    } else {
      this._$loadingMessageElement.removeClass('pp-hidden');
    }
  },
  
  _dataSource: null,
  
  /**
    Returns the TableViewDataSource for this TableView.
    @type Pushpop.TableViewDataSource
  */
  getDataSource: function() { return this._dataSource; },
  
  /**
    Sets a TableViewDataSource for this TableView and reloads the data.
    @param {Pushpop.TableViewDataSource} dataSource The TableViewDataSource to bind
    to this TableView.
  */
  setDataSource: function(dataSource) {
    var previousDataSource = this.getDataSource();
    
    this._dataSource = dataSource;
    dataSource.setTableView(this);
    
    this.$trigger($.Event(Pushpop.TableView.EventType.DidChangeDataSource, {
      tableView: this,
      dataSource: dataSource,
      previousDataSource: previousDataSource
    }));
    
    this.reloadData();
  },
  
  _searchBar: null,
  
  /**
    Returns the TableViewSearchBar for this TableView if it contains one.
    @type Pushpop.TableViewSearchBar
  */
  getSearchBar: function() { return this._searchBar; },
  
  /**
    Sets a TableViewSearchBar for this TableView.
    @param {Pushpop.TableViewSearchBar} searchBar The TableViewSearchBar to attach
    to this TableView.
  */
  setSearchBar: function(searchBar) { this._searchBar = searchBar; },
  
  _rowHeight: 44,
  
  /**
  
  */
  getRowHeight: function() { return this._rowHeight; },
  
  /**
  
  */
  setRowHeight: function(rowHeight) { this._rowHeight = rowHeight; },
  
  _editing: false,
  
  /**
    Determines if this TableView is in editing mode.
    @type Boolean
  */
  getEditing: function() { return this._editing; },
  
  /**
    Used for setting the table view in or out of editing mode.
    @param {Boolean} editing A flag indicating if the TableView should be in editing mode.
    @param {Boolean} [animated] An optional flag indicating if the transition in or out of
    editing mode should be animated (default: true).
  */
  setEditing: function(editing, animated) {
    if ((this._editing = editing)) {
      this.$element.addClass('pp-table-view-editing');
    } else {
      this.$element.removeClass('pp-table-view-editing');
    }
  },
  
  _selectionTimeoutDuration: 250,
  
  /**
  
  */
  getSelectionTimeoutDuration: function() { return this._selectionTimeoutDuration; },
  
  /**
  
  */
  setSelectionTimeoutDuration: function(selectionTimeoutDuration) { this._selectionTimeoutDuration = selectionTimeoutDuration; },
  
  _selectedRowIndexes: null, // []
  
  /**
    Returns the index in for the first selected row.
    @description NOTE: This is an index of a row in the data source, NOT an index
    of a cell in the DOM. If no rows are selected, this method will return -1.
    @type Number
  */
  getIndexForSelectedRow: function() {
    var selectedRowIndexes = this._selectedRowIndexes;
    return (selectedRowIndexes && selectedRowIndexes.length > 0) ? selectedRowIndexes[0] : -1;
  },
  
  /**
    Returns the indexes in for the selected rows.
    @description NOTE: The array contains indexes of rows in the data source, NOT
    indexes of cells in the DOM. If no rows are selected, this array will be empty.
    @type Array
  */
  getIndexesForSelectedRows: function() {
    return this._selectedRowIndexes;
  },
  
  /**
    Determines if the specified index is a selected row.
    @description NOTE: This is an index of a row in the data source, NOT an index
    of a cell in the DOM.
    @type Boolean
  */
  isRowSelectedAtIndex: function(index) {
    var selectedRowIndexes = this._selectedRowIndexes;
    for (var i = 0, length = selectedRowIndexes.length; i < length; i++) if (selectedRowIndexes[i] === index) return true;
    return false;
  },
  
  /**
    Selects the row at the specified index and triggers the DidSelectRowAtIndex event on
    this and all parent table view elements.
    @description NOTE: If the row contains a child data source, this method will automatically
    push a dynamic table view using the child data source. The DidSelectRowAtIndex event contains
    a flag |hasChildDataSource| to indicate whether or not a new dynamic table view was pushed
    prior to the event.
    @param {Number} index The index of a row in the data source to select.
    @param {Boolean} [animated] A flag indicating if the selection should be animated
    if the row is currently visible.
  */
  selectRowAtIndex: function(index, animated) {
    var dataSource = this.getDataSource();
    var shouldSelectRowAtIndex = dataSource.shouldSelectRowAtIndex(index);
    if (!shouldSelectRowAtIndex) return;
    
    this.deselectAllRows();
    
    var $element = this.$element;
    this._selectedRowIndexes.push(index);
    
    var tableViewCell, $cells = this.$element.children();
    for (var i = 0, length = $cells.length; i < length; i++) {
      tableViewCell = $cells[i].tableViewCell;
      if (tableViewCell.getIndex() === index) {
        tableViewCell.setSelected(true);
        tableViewCell.forceReflow();
        break;
      }
    }
    
    var self = this;
    
    // If this row contains a child data source, automatically push a new dynamic table view with it.
    if (dataSource.rowHasChildDataSourceAtIndex(index)) {
      var childDataSource = dataSource.getChildDataSourceForRowAtIndex(index);
      var viewStack = this.getViewStack();
      
      if (childDataSource && viewStack) {
        viewStack.pushNewTableView(function(childTableView) {
          if (self.getSearchBar()) childTableView.setSearchBar(new Pushpop.TableViewSearchBar(childTableView));
          childTableView.setDataSource(childDataSource);
          childTableView.setParentTableView(self);
        });
        
        // Trigger the DidSelectRowAtIndex event on this and all parent table view elements.
        window.setTimeout(function() {
          self.triggerEventOnParentTableViews($.Event(Pushpop.TableView.EventType.DidSelectRowAtIndex, {
            tableView: self,
            index: index,
            item: dataSource.getFilteredItemAtIndex(index),
            hasChildDataSource: true
          }), true);
        }, 1);
        
        return;
      }
    }
    
    // Trigger the DidSelectRowAtIndex event on this and all parent table view elements.
    window.setTimeout(function() {
      self.triggerEventOnParentTableViews($.Event(Pushpop.TableView.EventType.DidSelectRowAtIndex, {
        tableView: self,
        index: index,
        item: dataSource.getFilteredItemAtIndex(index),
        hasChildDataSource: false
      }), true);
    }, 1);
  },
  
  /**
    De-selects the row at the specified index and optionally animates the de-selection
    if the row is currently visible.
    @description NOTE: This method will not modify any other existing selections.
    @param {Number} index The index of a row in the data source to de-select.
    @param {Boolean} [animated] A flag indicating if the de-selection should be
    animated if the row is currently visible.
  */
  deselectRowAtIndex: function(index, animated) {
    var $element = this.$element;
    var selectedRowIndexes = this._selectedRowIndexes;
    var i, length;
    for (i = 0, length = selectedRowIndexes.length; i < length; i++) {
      if (selectedRowIndexes[i] === index) {
        selectedRowIndexes.splice(i, 1);
        break;
      }
    }
    
    var tableViewCell, $selectedCells = $element.children('.pp-table-view-selected-state');
    for (i = 0, length = $selectedCells.length; i < length; i++) {
      tableViewCell = $selectedCells[i].tableViewCell;
      if (tableViewCell.getIndex() === index) {
        tableViewCell.setSelected(false);
        break;
      }
    }
    
    $element.trigger($.Event(Pushpop.TableView.EventType.DidDeselectRowAtIndex, {
      tableView: this,
      index: index
    }));
  },
  
  /**
    De-selects all rows in the table.
  */
  deselectAllRows: function() {
    var $element = this.$element;
    var selectedRowIndexes = this._selectedRowIndexes;
    for (var i = 0, length = selectedRowIndexes.length; i < length; i++) {
      $element.trigger($.Event(Pushpop.TableView.EventType.DidDeselectRowAtIndex, {
        tableView: this,
        index: selectedRowIndexes[i]
      }));
    }
    
    selectedRowIndexes.length = 0;
    
    $element.children('.pp-table-view-selected-state').each(function(index, element) {
      element.tableViewCell.setSelected(false);
    });
  },
  
  _parentTableView: null,
  
  /**
    Returns the parent table view if this table view has one.
    @type Pushpop.TableView
  */
  getParentTableView: function() { return this._parentTableView; },
  
  /**
    Sets the parent table view for this table view.
    @param {Pushpop.TableView} parentTableView The table view to set as the parent for this table view.
    @description NOTE: To remove this table view from its parent, call this method
    and pass in a |null| value.
  */
  setParentTableView: function(parentTableView) { this._parentTableView = parentTableView; },
  
  /**
    Traverses the parent table views up the chain until it encounters a table view
    with no parent then returns an array of Pushpop.TableView objects.
    @type Array
  */
  getParentTableViews: function() {
    var parentTableViews = [];
    var currentParentTableView = this.getParentTableView();
    
    while (currentParentTableView) {
      parentTableViews.push(currentParentTableView);
      currentParentTableView = currentParentTableView.getParentTableView();
    }
    
    return parentTableViews;
  },
  
  /**
    Triggers the specified event on the parent table view elements and optionally
    also on this own table view's element.
    @param {$.Event|String} evt The event to be triggered on the table view element(s).
    @param {Boolean} [includeSelf] A flag indicating whether or not the event should
    also be triggered on this table view's element.
  */
  triggerEventOnParentTableViews: function(evt, includeSelf) {
    var parentTableViews = this.getParentTableViews();
    for (var i = 0, length = parentTableViews.length; i < length; i++) parentTableViews[i].$trigger(evt);
    if (includeSelf) this.$trigger(evt);
  },
  
  /**
    Returns the view that contains this table view.
    @description NOTE: If this table view is not contained within a view, this method will return null.
    @type Pushpop.View
  */
  getView: function() {
    var parents = this.$element.parents();
    var view;
    for (var i = 0, length = parents.length; i < length; i++) if ((view = parents[i].view)) return view;
    return null;
  },
  
  /**
    Returns the view stack that contains this table view.
    @description NOTE: If this table view is not contained within a view stack, this method will return null.
    @type Pushpop.ViewStack
  */
  getViewStack: function() {
    var parents = this.$element.parents();
    var viewStack;
    for (var i = 0, length = parents.length; i < length; i++) if ((viewStack = parents[i].viewStack)) return viewStack;
    return null;
  },
  
  /**
    Convenience accessor for jQuery's .bind() method.
  */
  $bind: function() { this.$element.bind.apply(this.$element, arguments); },
  
  /**
    Convenience accessor for jQuery's .unbind() method.
  */
  $unbind: function() { this.$element.unbind.apply(this.$element, arguments); },
  
  /**
    Convenience accessor for jQuery's .delegate() method.
  */
  $delegate: function() { this.$element.delegate.apply(this.$element, arguments); },
  
  /**
    Convenience accessor for jQuery's .undelegate() method.
  */
  $undelegate: function() { this.$element.undelegate.apply(this.$element, arguments); },
  
  /**
    Convenience accessor for jQuery's .trigger() method.
  */
  $trigger: function() { this.$element.trigger.apply(this.$element, arguments); }
};

/**
  Creates a new data source for a TableView.
  @param {Array} [dataSet] An optional array of data to initialize a default data source.
  @param {Array} [dataSet.id] The unique identifier for a specific record.
  @param {Array} [dataSet.value] The (sometimes) hidden value for a specific record.
  @param {Array} [dataSet.title] The title to be displayed in a TableViewCell for a specific record.
  @param {String} [defaultReuseIdentifier] The optional reuse identifier to be used for rows that do
  not specify a specific reuse identifier.
  @constructor
*/
Pushpop.TableViewDataSource = function TableViewDataSource(dataSet, defaultReuseIdentifier) {
  this.setDataSet(dataSet || []);
  this.setDefaultReuseIdentifier(defaultReuseIdentifier || this.getDefaultReuseIdentifier());
};

Pushpop.TableViewDataSource.prototype = {
  constructor: Pushpop.TableViewDataSource,
  
  /**
    Returns the number of rows provided by this data source.
    @description NOTE: This is the default implementation and should be overridden for data
    sources that are not driven directly from an in-memory data set.
    @type Number
  */
  getNumberOfRows: function() { return this.getNumberOfFilteredItems(); },
  
  /**
    Returns a TableViewCell for the specified index.
    @description NOTE: This is the default implementation and should be overridden for data
    sources that are not driven directly from an in-memory data set.
    @param {Pushpop.TableView} tableView The TableView the TableViewCell should be returned for.
    @param {Number} index The index of the data to be used when populating the TableViewCell.
    @type Pushpop.TableViewCell
  */
  getCellForRowAtIndex: function(tableView, index) {
    var item = this.getFilteredItemAtIndex(index);
    var reuseIdentifier = item.reuseIdentifier || this.getDefaultReuseIdentifier();
    var accessoryType = item.accessoryType || this.getDefaultAccessoryType();
    var editingAccessoryType = item.editingAccessoryType || this.getDefaultEditingAccessoryType();
    var cell = tableView.dequeueReusableCellWithIdentifier(reuseIdentifier);
    
    cell.setIndex(index);
    cell.setAccessoryType(accessoryType);
    cell.setEditingAccessoryType(editingAccessoryType);
    cell.setData(item);
    
    return cell;
  },
  
  /**
    Returns an array containing the key/value pairs for all "values" contained within the data
    source. This is typically used for retrieving form fields stored within a table view and
    behaves similarly to jQuery's .serializeArray() function.
    @param {String} [keyFieldName] The name of the field in the data source containing the
    values' keys. If not specified, the default value is 'name'.
    @param {String} [valueFieldName] The name of the field in the data source containing the
    values' values. If not specified, the default value is 'value.
    @type Array
  */
  getValuesArray: function(keyFieldName, valueFieldName) {
    keyFieldName = keyFieldName || 'name';
    valueFieldName = valueFieldName || 'value';
    
    var numberOfItems = this.getNumberOfItems();
    var valuesArray = [];
    var item, name, value;
    
    for (var i = 0; i < numberOfItems; i++) {
      item = this.getItemAtIndex(i);
      name = item[keyFieldName];
      value = item[valueFieldName];
      
      if (value !== undefined) valuesArray.push({
        name: item[keyFieldName] || keyFieldName,
        value: item[valueFieldName]
      });
    }
    
    return valuesArray;
  },
  
  /**
    Returns an object containing the data for all "values" contained within the data source.
    This is typically used for retrieving form fields stored within a table view.
    @description NOTE: If a field name occurs more than once, its values will be put into an
    array.
    @param {String} [keyFieldName] The name of the field in the data source containing the
    values' keys. If not specified, the default value is 'name'.
    @param {String} [valueFieldName] The name of the field in the data source containing the
    values' values. If not specified, the default value is 'value.
    @type Object
  */
  getValuesObject: function(keyFieldName, valueFieldName) {
    var valuesArray = this.getValuesArray(keyFieldName, valueFieldName);
    var valuesObject = {};
    
    var value;
    for (var i = 0, length = valuesArray.length; i < length; i++) {
      value = valuesArray[i];
      
      if (valuesObject[value.name] !== undefined) {
        if (!valuesObject[value.name].push) valuesObject[value.name] = [valuesObject[value.name]];
        valuesObject[value.name].push(value.value);
      } else {
        valuesObject[value.name] = value.value;
      }
    }
    
    return valuesObject;
  },
  
  /**
    Sets the "values" for the items contained within the data source from an object containing
    key/value pairs.
    @param {Object} object The object to map key/value pairs from.
    @param {String} [keyFieldName] The name of the field in the data source containing the
    values' keys. If not specified, the default value is 'name'.
    @param {String} [valueFieldName] The name of the field in the data source containing the
    values' values. If not specified, the default value is 'value.
  */
  setValuesFromObject: function(object, keyFieldName, valueFieldName) {
    if (!object) return;
    
    keyFieldName = keyFieldName || 'name';
    valueFieldName = valueFieldName || 'value';
    
    var numberOfItems = this.getNumberOfItems();
    var i, item;
    
    for (var key in object) {
      for (i = 0; i < numberOfItems; i++) {
        item = this.getItemAtIndex(i);
        
        if (item[keyFieldName] === key) {
          item[valueFieldName] = object[key];
          break;
        }
      }
    }
    
    var tableView = this.getTableView();
    if (tableView) tableView.reloadData();
  },
  
  clearValues: function(valueFieldName, defaultValueFieldName) {
    valueFieldName = valueFieldName || 'value';
    defaultValueFieldName = defaultValueFieldName || 'defaultValue';
    
    var numberOfItems = this.getNumberOfItems();
    var item, value, defaultValue;
    
    for (var i = 0; i < numberOfItems; i++) {
      item = this.getItemAtIndex(i);
      value = item[valueFieldName];
      defaultValue = item[defaultValueFieldName] || null;
      
      if (value !== undefined || defaultValue) item[valueFieldName] = defaultValue;
    }
    
    var tableView = this.getTableView();
    if (tableView) tableView.reloadData();
  },
  
  /**
    Determines if the table should be reloaded following a change in the search string.
    @description The default implementation assumes that the data set is fully loaded into
    memory and executes the current filter function against each item in the data set. If the
    filtered data set has changed since the last reload, it will return |true| which will force
    the associated TableViewSearchBar to reload the data for the TableView. In a custom data
    source that does not use an in-memory data set (e.g.: WebSQL or HTML5 LocalStorage), it is
    recommended to override this method to perform any necessary queries asynchronously and
    immediately return |false|. Once the asynchronous queries have completed, the application
    should then manually call .reloadData() on the TableView to force an update (See the WebSQL
    demo for an example on this implementation).
    @param {String} searchString The search string to be used for matching items in the data set.
    @param {Boolean} [isCaseSensitive] An optional boolean flag for forcing a case-sensitive search.
    @type Boolean
  */
  shouldReloadTableForSearchString: function(searchString, isCaseSensitive) {
    var dataSet = this.getDataSet();
    if (!dataSet) return false;
    
    var filterFunction = this.getFilterFunction();
    if (!filterFunction || typeof filterFunction !== 'function' || !searchString) {
      this._lastSearchString = null;
      
      if (this._filteredDataSet !== dataSet) {
        this._filteredDataSet = dataSet;
        return true;
      }
      
      return false;
    }
    
    var filteredDataSet = [];
    var regExp = new RegExp(searchString + '+', (!isCaseSensitive ? 'i' : '') + 'm');
    var item, i, length;
    
    // The search string is a continuation of the last search string (e.g.: 'ab' -> 'abc').
    if (searchString.indexOf(this._lastSearchString) === 0) {
      
      // Search the previous filtered data set instead of the whole data set.
      var lastFilteredDataSet = this._filteredDataSet;
      for (i = 0, length = lastFilteredDataSet.length; i < length; i++) if (filterFunction(regExp, item = lastFilteredDataSet[i])) filteredDataSet.push(item);
    }
    
    // The search string is NOT a contination of the last search string (e.g.: 'abc' -> 'ab').
    else {
      
      // Search the whole data set.
      for (i = 0, length = dataSet.length; i < length; i++) if (filterFunction(regExp, item = dataSet[i])) filteredDataSet.push(item);
    }
    
    this._filteredDataSet = filteredDataSet;
    this._lastSearchString = searchString;
    return true;
  },
  
  _lastSearchString: null,
  
  /**
    Returns a flag indicating whether or not the row at the specified index should be able
    to be selected.
    @description NOTE: This is the default implementation and should be overridden if certain
    rows should not be able to be selected.
    @param {Number} index The index of the row to determine whether or not it should be selectable.
    @type Boolean
  */
  shouldSelectRowAtIndex: function(index) { return true; },
  
  /**
    Returns a flag indicating whether or not the row at the specified index contains a child
    data source.
    @description NOTE: This is the default implementation and should be overridden for data
    sources that are not driven directly from an in-memory data set. In the default implementation,
    the |dataSourceKey| that is set using the setDataSourceKey() method is used to determine if an
    array of objects exists for that key on the item at the specified index.
    @param {Number} index The index of the row to determine whether or not it contains a child data source.
    @type Boolean
  */
  rowHasChildDataSourceAtIndex: function(index) {
    var key = this.getChildDataSourceKey();
    if (!key) return;
    
    var item = this.getFilteredItemAtIndex(index);
    return !!(item && item[key] && item[key] instanceof Array);
  },
  
  /**
    Creates and returns a new data source for the row at the specified index if the item at
    that index contains a child data source as determined by the rowHadChildDataSourceAtIndex()
    method.
    @description NOTE: This is the default implementation and should be overridden for data
    sources that are not driven directly from an in-memory data set. In the default implementation,
    the |dataSourceKey| that is set using the setDataSourceKey() method is used to retrieve the
    array of objects for that key on the item at the specified index. The array of child objects are
    then used to create a new data source. The new data source is automatically given the same child
    data source key in order to continue chaining nested data n-levels deep.
    @param {Number} index The index of the row to retrieve a child data source for.
    @type Pushpop.TableViewDataSource
  */
  getChildDataSourceForRowAtIndex: function(index) {
    var key = this.getChildDataSourceKey();
    if (!key) return null;
    
    var item = this.getFilteredItemAtIndex(index);
    var childDataSet = item[key];
    if (!childDataSet) return null;
    
    var childDataSource = new Pushpop.TableViewDataSource(childDataSet, this.getDefaultReuseIdentifier());
    childDataSource.setChildDataSourceKey(key);
    
    // Inherit properties from this parent data source for the new child data source.
    childDataSource.shouldSelectRowAtIndex = this.shouldSelectRowAtIndex;
    childDataSource.shouldReloadTableForSearchString = this.shouldReloadTableForSearchString;
    
    childDataSource.setFilterFunction(this.getFilterFunction());
    
    return childDataSource;
  },
  
  _tableView: null,
  
  /**
    Returns the TableView this data source is bound to.
    @type Pushpop.TableView
  */
  getTableView: function() { return this._tableView; },
  
  /**
    Sets the TableView this data source should be bound to.
    @param {Pushpop.TableView} tableView The TableView to bind this data source to.
  */
  setTableView: function(tableView) {
    this._tableView = tableView;
  
    var searchBar = tableView.getSearchBar();
    if (searchBar) searchBar.setSearchString(this._lastSearchString);
  },
  
  _defaultReuseIdentifier: 'pp-table-view-cell-default',
  
  /**
    Returns the default reuse identifier that this data source will use when a
    reuse identifier is not specified for a particular item.
    @type String
  */
  getDefaultReuseIdentifier: function() { return this._defaultReuseIdentifier; },
  
  /**
    Sets the default reuse identifier that this data source will use when a
    reuse identifier is not specified for a particular item.
    @param {String} defaultReuseIdentifier The reuse identifier to set as default.
  */
  setDefaultReuseIdentifier: function(defaultReuseIdentifier) { this._defaultReuseIdentifier = defaultReuseIdentifier; },
  
  _defaultAccessoryType: 'pp-table-view-cell-accessory-none',
  
  /**
    Returns the default accessory type that this data source will use when an
    accessory type is not specified for a particular item.
    @description NOTE: The available accessory types are defined by the
    Pushpop.TableViewCell.AccessoryType singleton.
    @type String
  */
  getDefaultAccessoryType: function() { return this._defaultAccessoryType; },
  
  /**
    Sets the default accessory type that this data source will use when an
    accessory type is not specified for a particular item.
    @description NOTE: The available accessory types are defined by the
    Pushpop.TableViewCell.AccessoryType singleton.
    @param {String} defaultAccessoryType The accessory type to set as default.
  */
  setDefaultAccessoryType: function(defaultAccessoryType) { this._defaultAccessoryType = defaultAccessoryType; },
  
  _defaultEditingAccessoryType: 'pp-table-view-cell-editing-accessory-none',
  
  /**
    Returns the default editing accessory type that this data source will use when an
    editing accessory type is not specified for a particular item.
    @description NOTE: The available editing accessory types are defined by the
    Pushpop.TableViewCell.EditingAccessoryType singleton.
    @type String
  */
  getDefaultEditingAccessoryType: function() { return this._defaultEditingAccessoryType; },
  
  /**
    Sets the default editing accessory type that this data source will use when an
    editing accessory type is not specified for a particular item.
    @description NOTE: The available editing accessory types are defined by the
    Pushpop.TableViewCell.EditingAccessoryType singleton.
    @param {String} defaultEditingAccessoryType The editing accessory type to set as default.
  */
  setDefaultEditingAccessoryType: function(defaultEditingAccessoryType) { this._defaultEditingAccessoryType = defaultEditingAccessoryType; },
  
  _dataSet: null,
  
  /**
    Returns the in-memory data set this data source will provide to the table view.
    @description NOTE: This may not be utilized by a custom data source.
    @type Array
  */
  getDataSet: function() { return this._dataSet; },
  
  /**
    Sets the in-memory data set this data source should provide to the table view.
    @description NOTE: This may not be utilized by a custom data source.
    @param {Array} dataSet The set of data that this data source should provide to the table view.
  */
  setDataSet: function(dataSet) {
    this._dataSet = dataSet;
    this.shouldReloadTableForSearchString('');
    
    var tableView = this.getTableView();
    if (tableView) tableView.reloadData();
  },
  
  _childDataSourceKey: null,
  
  /**
    Returns a string that specifies a key on this data source's objects that may contain
    an array of data for a child data source.
    @type String
  */
  getChildDataSourceKey: function() { return this._childDataSourceKey; },
  
  /**
    Sets a string that specifies a key on this data source's objects that may contain
    an array of data for a child data source.
    @param {String} childDataSourceKey A string containing a key on this data source's
    objects that may contain a child data source.
  */
  setChildDataSourceKey: function(childDataSourceKey) { this._childDataSourceKey = childDataSourceKey; },
  
  _filteredDataSet: null,
  
  /**
    Returns the filtered in-memory data set this data source will provide to the table view.
    @description NOTE: This may not be utilized by a custom data source.
    @type Array
  */
  getFilteredDataSet: function() { return this._filteredDataSet; },
  
  /**
    Returns the total number of items contained within this data source.
    @description NOTE: This method is not typically used during the table view's rendering
    process. It is intended more for data-centric operations on this data source
    (e.g.: searching, filtering).
    IMPORTANT: When working with a data source that is driven from an in-memory data set,
    this method should ALWAYS be used to determine the length of the complete data set. It is
    NOT RECOMMENDED that the |length| property be accessed on the data set's array directly.
    @type Number
  */
  getNumberOfItems: function() { return this.getDataSet().length; },
  
  /**
    Returns the item at the specified index of the complete data set contained within this
    data source.
    @description NOTE: This method is not typically used during the table view's rendering
    process. It is intended more for data-centric operations on this data source
    (e.g.: searching, filtering).
    IMPORTANT: When working with a data source that is driven from an in-memory data set,
    this method should ALWAYS be used to access elements from the complete data set. It is NOT
    RECOMMENDED that the elements be accessed using "[ ]" notation on the complete data set's
    array directly.
    @param {Number} index The index of the item in the complete data set to retrieve within
    this data source.
    @type Object
  */
  getItemAtIndex: function(index) { return this.getDataSet()[index]; },
  
  /**
    Returns the number of filtered items contained within this data source.
    @description NOTE: This method is called directly by the table view's rendering process.
    It should yield the same result as the getNumberOfRows method in most cases.
    IMPORTANT: When working with a data source that is driven from an in-memory data set,
    this method should ALWAYS be used to determine the length of the filtered data set. It is
    NOT RECOMMENDED that the |length| property be accessed on the filtered data set's array
    directly.
    @type Number
  */
  getNumberOfFilteredItems: function() { return this.getFilteredDataSet().length; },
  
  /**
    Returns the item at the specified index of the filtered data set contained within this
    data source.
    @description NOTE: This method is called directly by the table view's rendering process.
    It should yield the same data that is used by the getCellForRowAtIndex method in most cases.
    IMPORTANT: When working with a data source that is driven from an in-memory data set,
    this method should ALWAYS be used to access elements from the filtered data set. It is NOT
    RECOMMENDED that the elements be accessed using "[ ]" notation on the filtered data set's
    array directly.
    @param {Number} index The index of the item in the filtered data set to retrieve within
    this data source.
    @type Object
  */
  getFilteredItemAtIndex: function(index) { return this.getFilteredDataSet()[index]; },
  
  setValueForKeyOnItem: function(item, key, value) {
    if (!item || !key) return;
    
    var previousValue = item[key];
    if (previousValue === value) return;
    
    item[key] = value;
    
    var tableView = this.getTableView();
    tableView.$trigger($.Event(Pushpop.TableView.EventType.DidChangeValueForItemInDataSource, {
      tableView: tableView,
      dataSource: this,
      item: item,
      key: key,
      value: value,
      previousValue: previousValue
    }));
  },
  
  _filterFunction: function(regExp, item) {
    
    // Default filter function implementation that searches an item's title.
    return regExp.test(item.title);
  },
  
  /**
    Returns the current filter function for searching this TableView.
    @description NOTE: This may not be utilized by a custom data source.
    @type Function
  */
  getFilterFunction: function() { return this._filterFunction; },
  
  /**
    Sets a filter function to be used when searching this TableView.
    @param {Function} filterFunction The filter function to be used when searching this TableView.
    @description The filter function gets called for each item in the data set during a search. A
    valid filter function must take two parameters (regExp, item) and return a Boolean value. The
    |regExp| parameter contains a RegExp object based on the search string to be used to match items
    in the data set. The |item| parameter contains an item from the data set that the search string
    in the RegExp should be tested against. The provided filter function should return a Boolean
    value: |true| if the item should match the search string or |false| if it should be filtered out.
    NOTE: This may not be utilized by a custom data source.
  */
  setFilterFunction: function(filterFunction) { this._filterFunction = filterFunction; }
};

/**
  Creates a new search bar for a TableView.
  @param {Pushpop.TableView} tableView The TableView this search bar should be attached to.
  @constructor
*/
Pushpop.TableViewSearchBar = function TableViewSearchBar(tableView) {
  var $element = this.$element = $('<div class="pp-table-view-search-bar"/>');
  var element = this.element = $element[0];
  
  var self = element.tableViewSearchBar = this;
  
  var $input = this.$input = $('<input type="text" placeholder="Search"/>').appendTo($element);
  var $cancelButton = this.$cancelButton = $('<a class="pp-table-view-search-bar-button" href="#">Cancel</a>').appendTo($element);
  var $clearButton = this.$clearButton = $('<a class="pp-table-view-search-bar-clear-button" href="#"/>').appendTo($element);
  var $overlay = this.$overlay = $('<div class="pp-table-view-search-bar-overlay"/>');
  
  var willClickCancel = false;
  var willClickClear = false;
  var willFocus = false;
  
  $element.delegate('a', 'click', function(evt) { evt.preventDefault(); });
  $element.delegate('a', !!('ontouchstart' in window) ? 'touchstart' : 'mousedown', function(evt) {
    evt.stopImmediatePropagation();
    evt.preventDefault();
    
    var $button = $(this);
    if ($button.hasClass('pp-table-view-search-bar-button')) willClickCancel = true;
    else if ($button.hasClass('pp-table-view-search-bar-clear-button')) willClickClear = true;
  });
  $element.delegate('a', !!('ontouchmove' in window) ? 'touchmove' : 'mousemove', function(evt) {
    if (willClickCancel || willClickClear) willClickCancel = willClickClear = false;
  });
  $element.delegate('a', !!('ontouchend' in window) ? 'touchend' : 'mouseup', function(evt) {
    if (willClickCancel) {
      willClickCancel = false;
      $input.val(null).trigger('keyup').trigger('blur');
    }
    
    else if (willClickClear) {
      willClickClear = false;
      $input.val(null).trigger('keyup');
    }
  });
  $input.bind('mousedown touchstart', function(evt) {
    if ($input.is(':focus')) {
      evt.stopPropagation();
      return;
    }
    
    evt.preventDefault();
    willFocus = true;
  });
  $input.bind('mousemove touchmove', function(evt) { willFocus = false; });
  $input.bind('mouseup touchend', function(evt) {
    if ($input.is(':focus')) {
      evt.stopPropagation();
      return;
    }
    
    evt.preventDefault();
    if (willFocus) $input.trigger('focus');
  });
  $input.bind('focus', function(evt) {
    if (!willFocus) {
      $input.trigger('blur');
      return false;
    }
    
    willFocus = false;
    
    window.setTimeout(function() {
      $overlay.addClass('pp-active');
      if ($input.val()) $clearButton.addClass('pp-active');
    }, 1);
    
    self.getTableView().scrollView.scrollToTop();
  });
  $input.bind('blur', function(evt) { $overlay.removeClass('pp-active'); $clearButton.removeClass('pp-active'); });
  $overlay.bind('mousedown touchstart', function(evt) { evt.stopPropagation(); evt.preventDefault(); });
  $overlay.bind('mouseup touchend', function(evt) { $input.trigger('blur'); });
  $input.bind('keyup', function(evt) {
    
    // If 'ESC' key was pressed, cancel the search.
    if (evt.keyCode === 27) {
      $input.val(null).trigger('keyup').trigger('blur');
      return;
    }
    
    var searchString = $input.val();
    var tableView = self._tableView;
    
    if (!searchString) {
      $overlay.addClass('pp-active');
      $clearButton.removeClass('pp-active');
    } else {
      $overlay.removeClass('pp-active');
      $clearButton.addClass('pp-active');
    }
    
    if (tableView.getDataSource().shouldReloadTableForSearchString(searchString)) tableView.reloadData();
  });
  
  this.attachToTableView(tableView);
};

Pushpop.TableViewSearchBar.prototype = {
  constructor: Pushpop.TableViewSearchBar,
  
  element: null,
  $element: null,
  $input: null,
  $cancelButton: null,
  $clearButton: null,
  $overlay: null,
  
  _tableView: null,
  
  /**
  
  */
  getTableView: function() { return this._tableView; },
  
  /**
    Attaches this TableViewSearchBar to a TableView.
    @param {Pushpop.TableView} tableView A TableView to attach this search bar to.
  */
  attachToTableView: function(tableView) {
    this._tableView = tableView;
    this.$overlay.appendTo(tableView.scrollView.$element);
    tableView.$element.before(this.$element);
  },
  
  /**
    Returns the current search string entered in the search bar.
    @type String
  */
  getSearchString: function() { return this.$input.val(); },
  
  /**
    Sets the current search string that should appear in the search bar.
    @param {String} searchString The search string that should appear in the search bar.
  */
  setSearchString: function(searchString) { this.$input.val(searchString); }
};

/**
  Creates a new default table view cell for a TableView with bold black title text.
  @param {String} reuseIdentifier A string containing an identifier that is unique
  to the group of cells that this cell should belong to. This reuse identifier is
  used by the TableView to recycle TableViewCells of the same style and type.
  @constructor
*/
Pushpop.TableViewCell = function TableViewCell(reuseIdentifier) {
  reuseIdentifier =  this._reuseIdentifier = reuseIdentifier || this._reuseIdentifier;
  
  var $element = this.$element = $('<li data-reuse-identifier="' + reuseIdentifier + '"/>');
  var element = this.element = $element[0];
  
  element.tableViewCell = this;
  
  $element.addClass(reuseIdentifier);
};

Pushpop.TableViewCell.AccessoryType = {
  None: 'pp-table-view-cell-accessory-none',
  DisclosureIndicator: 'pp-table-view-cell-accessory-disclosure-indicator',
  DetailDisclosureButton: 'pp-table-view-cell-accessory-detail-disclosure-button',
  Checkmark: 'pp-table-view-cell-accessory-checkmark',
  ConfirmDeleteButton: 'pp-table-view-cell-accessory-confirm-delete-button'
};

Pushpop.TableViewCell.EditingAccessoryType = {
  None: 'pp-table-view-cell-editing-accessory-none',
  AddButton: 'pp-table-view-cell-editing-accessory-add-button',
  DeleteButton: 'pp-table-view-cell-editing-accessory-delete-button'
};

Pushpop.TableViewCell.prototype = {
  constructor: Pushpop.TableViewCell,
  
  element: null,
  $element: null,
  
  tableView: null,
  
  _reuseIdentifier: 'pp-table-view-cell-default',
  
  /**
    Returns a string containing this cell's reuse identifier.
    @type String
  */
  getReuseIdentifier: function() { return this._reuseIdentifier; },
  
  /**
    Returns a string containing HTML to be used to render the cell's contents based
    on the cell's data.
    @description NOTE: When creating a custom cell class, this method should be
    overridden to provide the appropriate HTML markup for the cell.
    @type String
  */
  getHtml: function() {
    var data = this.getData();
    var title = $.trim((data && data.title) ? data.title : '&nbsp;');
    return '<h1>' + title + '</h1>';
  },

  /**
    Returns a string containing HTML to be used to render the cell's accessories
    based on the cell's accessory type.
    @type String
  */
  getEditingAccessoryHtml: function() {
    var editingAccessoryType = this.getEditingAccessoryType();
    if (!editingAccessoryType || editingAccessoryType === Pushpop.TableViewCell.EditingAccessoryType.None) return '';
    return '<span class="pp-table-view-cell-editing-accessory ' + editingAccessoryType + '"/>';
  },
  
  /**
    Returns a string containing HTML to be used to render the cell's accessories
    based on the cell's accessory type.
    @type String
  */
  getAccessoryHtml: function() {
    var accessoryType = this.getAccessoryType();
    if (!accessoryType || accessoryType === Pushpop.TableViewCell.AccessoryType.None) return '';
    return '<span class="pp-table-view-cell-accessory ' + accessoryType + '"/>';
  },
  
  /**
    Renders the cell using HTML provided by the getHtml() and getAccessoryHtml()
    methods.
    @description NOTE: In most circumstances, this method shouldn't need to be
    overridden when creating a custom cell class. Typically, when creating a custom
    cell class, only the getHtml() method should need to be overridden.
  */
  draw: function() {
    this.$element.html(this.getEditingAccessoryHtml() + this.getHtml() + this.getAccessoryHtml());
  },
  
  forceReflow: function() { var doNothing = this.element.offsetWidth; },
  
  /**
    Performs any necessary actions when this cell has been tapped.
    @description NOTE: The default implementation does nothing. This method is
    intended to be overridden by custom table view cells that require an action
    to be taken upon tapping the cell (e.g.: pushing a new view).
  */
  didReceiveTap: function() {},
  
  /**
    Removes this TableViewCell from the TableView's visible cells, resets its
    data and prepares it to be reused by the TableView by placing it in the
    reusable cells queue.
  */
  prepareForReuse: function() {
    
    // Detach the TableViewCell from the DOM.
    // NOTE: Using .detach() will preserve any attached event handlers.
    this.$element.detach();
    
    var tableView = this.tableView;
    var reuseIdentifier = this.getReuseIdentifier();
    var renderedCells = tableView.getRenderedCells();
    var reusableCells = tableView.getReusableCells();
    reusableCells = reusableCells[reuseIdentifier] || (reusableCells[reuseIdentifier] = []);
    
    reusableCells.push(this);
    
    for (var i = 0, length = renderedCells.length; i < length; i++) {
      if (renderedCells[i] === this) {
        renderedCells.splice(i, 1);
        break;
      }
    }
    
    this.setSelected(false);
    this.setIndex(-1);
    this.setAccessoryType(null);
    this.setEditingAccessoryType(null);
    this.setData(null);
  },
  
  _data: null,
  
  /**
    Returns the data of the item in the data source that corresponds to this cell.
    @type Object
  */
  getData: function() { return this._data; },
  
  /**
    Sets the data of this cell that corresponds to an item in the data source.
    @description NOTE: This method will set the cell's value to the |value| property
    of the provided data.
    @param {Object} data The data of an item in the data source to assign to this cell.
  */
  setData: function(data) {
    this._data = data;
    if (!data) return;
    if (data.value) {
      this.setValue(data.value);
      return;
    }
    
    this.draw();
  },
  
  _accessoryType: null,
  
  /**
    Returns the type of accessory to render for this cell. The types of available
    accessories are specified in Pushpop.TableViewCell.AccessoryType.
    @description NOTE: Table view cell accessories are rendered on the right-hand
    side of the cell.
    @type String
  */
  getAccessoryType: function() { return this._accessoryType; },
  
  /**
    Sets the type of accessory to render for this cell. The types of available
    accessories are specified in Pushpop.TableViewCell.AccessoryType.
    @description NOTE: Table view cell accessories are rendered on the right-hand
    side of the cell.
    @param {String} accessoryType The type of accessory to render for this cell.
  */
  setAccessoryType: function(accessoryType) { this._accessoryType = (accessoryType !== Pushpop.TableViewCell.AccessoryType.None) ? accessoryType : null; },
  
  _editingAccessoryType: null,
  
  /**
    Returns the type of editing accessory to render for this cell. The types of available
    editing accessories are specified in Pushpop.TableViewCell.EditingAccessoryType.
    @description NOTE: Table view cell editing accessories are rendered on the left-hand
    side of the cell.
    @type String
  */
  getEditingAccessoryType: function() { return this._editingAccessoryType; },
  
  /**
    Sets the type of editing accessory to render for this cell. The types of available
    editing accessories are specified in Pushpop.TableViewCell.EditingAccessoryType.
    @description NOTE: Table view cell editing accessories are rendered on the left-hand
    side of the cell.
    @param {String} editingAccessoryType The type of editing accessory to render for this cell.
  */
  setEditingAccessoryType: function(editingAccessoryType) { this._editingAccessoryType = (editingAccessoryType !== Pushpop.TableViewCell.EditingAccessoryType.None) ? editingAccessoryType : null; },
  
  _value: null,
  
  /**
    Returns the value of the item in the data source that corresponds to this cell.
    @description NOTE: This method is typically only used by "input" cell types. When
    setData() is called, the cell's value will be set to the |value| property of the
    cell's data (e.g.: this.getData().value). The value that is returned by this method
    originates from the |value| property of the cell's data.
    @type Number|String|Object
  */
  getValue: function() { return this._value; },
  
  /**
    Sets the value of this cell that corresponds to an item in the data source.
    @description NOTE: This method is typically only used by "input" cell types. When
    setData() is called, this method is called to set the |value| property of the
    cell's data (e.g.: this.getData().value). The value that is set by this method
    will also replace the value of the |value| property of the cell's data.
    @param {Number|String|Object} value The value of an item in the data source to assign to this cell.
  */
  setValue: function(value) {
    var data = this.getData();
    var dataSource = this.tableView.getDataSource();
    dataSource.setValueForKeyOnItem(data, 'value', value);
    
    this._value = value;
    this.draw();
  },
  
  _index: -1,
  
  /**
    Returns the index of the item in the data source that corresponds to this cell.
    @type Number
  */
  getIndex: function() { return this._index; },
  
  /**
    Sets the index of this cell that corresponds to an item in the data source.
    @param {Number} index The index of an item in the data source to assign to this cell.
  */
  setIndex: function(index) { this._index = index; },
  
  _isSelected: false,
  
  /**
    Returns a flag indicating whether or not this TableViewCell is currently selected.
    @type Boolean
  */
  getSelected: function() { return this._isSelected; },
  
  /**
    Sets a flag to indicate if this TableViewCell should be selected.
    @param {Boolean} value A boolean value to determine if this cell should be selected.
  */
  setSelected: function(value) {
    if ((this._isSelected = value)) {
      this.$element.addClass('pp-table-view-selected-state');
    } else {
      this.$element.removeClass('pp-table-view-selected-state');
    }
  }
};

// Register the prototype for Pushpop.TableViewCell as a reusable cell type.
Pushpop.TableView.registerReusableCellPrototype(Pushpop.TableViewCell.prototype);

/**
  Creates a new table view cell for a TableView with bold black title text and grey
  subtitle text.
  @param {String} reuseIdentifier A string containing an identifier that is unique
  to the group of cells that this cell should belong to.
  @constructor
  @extends Pushpop.TableViewCell
*/
Pushpop.SubtitleTableViewCell = function SubtitleTableViewCell(reuseIdentifier) {
  
  // Call the "super" constructor.
  Pushpop.TableViewCell.prototype.constructor.apply(this, arguments);
};

Pushpop.SubtitleTableViewCell.prototype = new Pushpop.TableViewCell('pp-subtitle-table-view-cell');
Pushpop.SubtitleTableViewCell.prototype.constructor = Pushpop.SubtitleTableViewCell;

Pushpop.SubtitleTableViewCell.prototype.getHtml = function() {
  var data = this.getData();
  var title = $.trim((data && data.title) ? data.title : '&nbsp;');
  var subtitle = $.trim((data && data.subtitle) ? data.subtitle : '&nbsp;');
  return '<h1>' + title + '</h1><h2>' + subtitle + '</h2>';
};

// Register the prototype for Pushpop.SubtitleTableViewCell as a reusable cell type.
Pushpop.TableView.registerReusableCellPrototype(Pushpop.SubtitleTableViewCell.prototype);

/**
  Creates a new table view cell for a TableView with a bold black text label and a
  blue text value.
  @param {String} reuseIdentifier A string containing an identifier that is unique
  to the group of cells that this cell should belong to.
  @constructor
  @extends Pushpop.TableViewCell
*/
Pushpop.ValueTableViewCell = function ValueTableViewCell(reuseIdentifier) {
  
  // Call the "super" constructor.
  Pushpop.TableViewCell.prototype.constructor.apply(this, arguments);
};

Pushpop.ValueTableViewCell.prototype = new Pushpop.TableViewCell('pp-value-table-view-cell');
Pushpop.ValueTableViewCell.prototype.constructor = Pushpop.ValueTableViewCell;

Pushpop.ValueTableViewCell.prototype.getHtml = function() {
  var data = this.getData();
  var title = $.trim((data && data.title) ? data.title : '&nbsp;');
  var value = $.trim((data && data.value) ? data.value : '&nbsp;');
  return '<h1>' + title + '</h1><h2>' + value + '</h2>';
};

// Register the prototype for Pushpop.ValueTableViewCell as a reusable cell type.
Pushpop.TableView.registerReusableCellPrototype(Pushpop.ValueTableViewCell.prototype);

/**
  Creates a new table view cell for a TableView with a small bold blue text label
  and a long black bold text value.
  @param {String} reuseIdentifier A string containing an identifier that is unique
  to the group of cells that this cell should belong to.
  @constructor
  @extends Pushpop.TableViewCell
*/
Pushpop.Value2TableViewCell = function Value2TableViewCell(reuseIdentifier) {
  
  // Call the "super" constructor.
  Pushpop.TableViewCell.prototype.constructor.apply(this, arguments);
};

Pushpop.Value2TableViewCell.prototype = new Pushpop.TableViewCell('pp-value2-table-view-cell');
Pushpop.Value2TableViewCell.prototype.constructor = Pushpop.Value2TableViewCell;

Pushpop.Value2TableViewCell.prototype.getHtml = function() {
  var data = this.getData();
  var title = $.trim((data && data.title) ? data.title : '&nbsp;');
  var value = $.trim((data && data.value) ? data.value : '&nbsp;');
  return '<h1>' + title + '</h1><h2>' + value + '</h2>';
};

// Register the prototype for Pushpop.Value2TableViewCell as a reusable cell type.
Pushpop.TableView.registerReusableCellPrototype(Pushpop.Value2TableViewCell.prototype);

/**
  Creates a new table view cell for a TableView with a small bold blue text label
  and an inline text input field.
  @param {String} reuseIdentifier A string containing an identifier that is unique
  to the group of cells that this cell should belong to.
  @constructor
  @extends Pushpop.TableViewCell
*/
Pushpop.InlineTextInputTableViewCell = function InlineTextInputTableViewCell(reuseIdentifier) {
  
  // Call the "super" constructor.
  Pushpop.TableViewCell.prototype.constructor.apply(this, arguments);
  
  var self = this;
  
  // Attach an event handler to this cell to update its value when the input changes.
  this.$element.delegate('input', 'keyup change', function(evt) {
    var data = self.getData();
    var value = $(this).val();
    var dataSource = self.tableView.getDataSource();
    dataSource.setValueForKeyOnItem(data, 'value', value);
    
    this._value = value;
  });
  
  this.$element.bind(!!('ontouchstart' in window) ? 'touchend' : 'mouseup', function(evt) {
    evt.preventDefault();
  });
};

Pushpop.InlineTextInputTableViewCell.prototype = new Pushpop.TableViewCell('pp-inline-text-input-table-view-cell');
Pushpop.InlineTextInputTableViewCell.prototype.constructor = Pushpop.InlineTextInputTableViewCell;

Pushpop.InlineTextInputTableViewCell.prototype.getHtml = function() {
  var data = this.getData();
  var title = $.trim((data && data.title) ? data.title : '&nbsp;');
  var name = $.trim((data && data.name) ? data.name : '');
  var value = $.trim((data && data.value) ? data.value : '');
  var autoCapitalize = (data) ? (data.autoCapitalize === false) ? 'off' : (data.autoCapitalize === true) ? 'on' : (data.autoCapitalize) ? data.autoCapitalize : 'on' : 'on';
  var autoCorrect = (data) ? (data.autoCorrect + '') : 'on';
  autoCorrect = !!(autoCorrect !== 'false' && autoCorrect !== 'off');
  var isPassword = (data) ? (data.password || 'false') : 'false';
  isPassword = isPassword !== 'false';
  return '<h1>' + title + '</h1><h2><input type="' + (isPassword ? 'password' : 'text') + '" name="' + name + '" value="' + value + '" autocapitalize="' + autoCapitalize + '" autocorrect="' + (autoCorrect ? 'on' : 'off') +'"/></h2>';
};

Pushpop.InlineTextInputTableViewCell.prototype.didReceiveTap = function() {
  var $element = this.$element;
  $element.find('input').trigger('focus');
  window.setTimeout(function() { $element.removeClass('pp-table-view-selected-state'); }, 100);
};

// Register the prototype for Pushpop.InlineTextInputTableViewCell as a reusable cell type.
Pushpop.TableView.registerReusableCellPrototype(Pushpop.InlineTextInputTableViewCell.prototype);

/**
  Creates a new table view cell for a TableView with a small bold blue text label
  and a long black bold text value. When this type of cell is tapped, a new view
  is presented with a large text area for entering long strings of text.
  @param {String} reuseIdentifier A string containing an identifier that is unique
  to the group of cells that this cell should belong to.
  @constructor
  @extends Pushpop.TableViewCell
*/
Pushpop.TextAreaInputTableViewCell = function TextAreaInputTableViewCell(reuseIdentifier) {
  
  // Call the "super" constructor.
  Pushpop.TableViewCell.prototype.constructor.apply(this, arguments);
};

Pushpop.TextAreaInputTableViewCell.prototype = new Pushpop.TableViewCell('pp-text-area-input-table-view-cell');
Pushpop.TextAreaInputTableViewCell.prototype.constructor = Pushpop.TextAreaInputTableViewCell;

Pushpop.TextAreaInputTableViewCell.prototype.getHtml = function() {
  var data = this.getData();
  var title = $.trim((data && data.title) ? data.title : '&nbsp;');
  var value = $.trim((data && data.value) ? data.value : '&nbsp;');
  return '<h1>' + title + '</h1><h2>' + value + '</h2>';
};

Pushpop.TextAreaInputTableViewCell.prototype.getAccessoryType = function() { return this._accessoryType || Pushpop.TableViewCell.AccessoryType.DisclosureIndicator; };

Pushpop.TextAreaInputTableViewCell.prototype.didReceiveTap = function() {
  var tableView = this.tableView;
  var viewStack = tableView.getViewStack();
  if (!viewStack) return;
  
  var data = this.getData();
  if (!data) return;
  
  var title = data.title || '';
  var name = data.name || '';
  var value = data.value || '';
  
  var self = this;
  
  // Push a new view with a large text area input.
  viewStack.pushNewView(function(newView) {
    var $textarea = $('<textarea class="pp-text-area-input-table-view-cell-textarea" name="' + name + '">' + value + '</textarea>').appendTo(newView.$element);
    
    newView.setTitle(title);
    newView.addBarButtonItem(new Pushpop.Button('Done', function(button) {
      self.setValue($textarea.val());
      tableView.reloadData();
      viewStack.pop();
    }, Pushpop.Button.ButtonAlignmentType.Right, Pushpop.Button.ButtonStyleType.Blue));
  });
};

// Register the prototype for Pushpop.TextAreaInputTableViewCell as a reusable cell type.
Pushpop.TableView.registerReusableCellPrototype(Pushpop.TextAreaInputTableViewCell.prototype);

/**
  Creates a new table view cell for a TableView with a small bold blue text label
  and a long black bold text value. When this type of cell is tapped, a table view
  is presented that contains the cell's "child" data source with a list of options
  to pick from.
  @description NOTE: The data for the "child" data source must be contained in a
  property in this cell's data called |childDataSource|.
  @param {String} reuseIdentifier A string containing an identifier that is unique
  to the group of cells that this cell should belong to.
  @constructor
  @extends Pushpop.TableViewCell
*/
Pushpop.SelectInputTableViewCell = function SelectInputTableViewCell(reuseIdentifier) {
  
  // Call the "super" constructor.
  Pushpop.TableViewCell.prototype.constructor.apply(this, arguments);
};

Pushpop.SelectInputTableViewCell.prototype = new Pushpop.TableViewCell('pp-select-input-table-view-cell');
Pushpop.SelectInputTableViewCell.prototype.constructor = Pushpop.SelectInputTableViewCell;

Pushpop.SelectInputTableViewCell.prototype.getHtml = function() {
  var data = this.getData();
  var title = $.trim((data && data.title) ? data.title : '&nbsp;');
  var value = $.trim((data && data.value) ? ((data.value.title) ? data.value.title : data.value) : '&nbsp;');
  return '<h1>' + title + '</h1><h2>' + value + '</h2>';
};

Pushpop.SelectInputTableViewCell.prototype.getAccessoryType = function() { return this._accessoryType || Pushpop.TableViewCell.AccessoryType.DisclosureIndicator; };

Pushpop.SelectInputTableViewCell.prototype.didReceiveTap = function() {
  var tableView = this.tableView;
  
  var viewStack = tableView.getViewStack();
  if (!viewStack) return;
  
  var view = tableView.getView();
  if (!view) return;
  
  var data = this.getData();
  if (!data) return;
  
  var childDataSource = new Pushpop.TableViewDataSource(data.childDataSource);
  
  var self = this;
  
  // Push a new view with a large text area input.
  viewStack.pushNewTableView(function(newTableView) {
    newTableView.setSearchBar(new Pushpop.TableViewSearchBar(newTableView));
    newTableView.setDataSource(childDataSource);
    
    newTableView.$bind(Pushpop.TableView.EventType.DidSelectRowAtIndex, function(evt) {
      if (evt.hasChildDataSource) return;
      
      var tableView = evt.tableView;
      var dataSource = tableView.getDataSource();
      var item = dataSource.getFilteredItemAtIndex(evt.index);
      
      self.setValue(item);
      viewStack.pop(view);
    });
  });
};

Pushpop.SelectInputTableViewCell.prototype.setValue = function(value) {
  var data = this.getData();
  var childDataSource;
  
  if (data) {
    if (!(value instanceof Object) && (childDataSource = data.childDataSource)) {
      for (var i = 0, length = childDataSource.length; i < length; i++) {
        if (childDataSource[i].value === value) {
          value = childDataSource[i];
          break;
        }
      }
    }
    
    var dataSource = this.tableView.getDataSource();
    dataSource.setValueForKeyOnItem(data, 'value', value);
  }
  
  this._value = value;
  this.draw();
};

// Register the prototype for Pushpop.SelectInputTableViewCell as a reusable cell type.
Pushpop.TableView.registerReusableCellPrototype(Pushpop.SelectInputTableViewCell.prototype);

/**
  Creates a new table view cell for a TableView with a small bold blue text label
  and a black bold date value. When this type of cell is tapped, a table view is
  presented that allows the user to select a date.
  @param {String} reuseIdentifier A string containing an identifier that is unique
  to the group of cells that this cell should belong to.
  @constructor
  @extends Pushpop.TableViewCell
*/
Pushpop.DateInputTableViewCell = function DateInputTableViewCell(reuseIdentifier) {
  
  // Call the "super" constructor.
  Pushpop.TableViewCell.prototype.constructor.apply(this, arguments);
};

Pushpop.DateInputTableViewCell.prototype = new Pushpop.TableViewCell('pp-date-input-table-view-cell');
Pushpop.DateInputTableViewCell.prototype.constructor = Pushpop.DateInputTableViewCell;

Pushpop.DateInputTableViewCell.prototype.getHtml = function() {
  var data = this.getData();
  var title = $.trim((data && data.title) ? data.title : '&nbsp;');
  var value = $.trim((data && data.value) ? data.value : '&nbsp;');
  return '<h1>' + title + '</h1><h2>' + value + '</h2>';
};

Pushpop.DateInputTableViewCell.prototype.getAccessoryType = function() { return this._accessoryType || Pushpop.TableViewCell.AccessoryType.DisclosureIndicator; };

Pushpop.DateInputTableViewCell.prototype.didReceiveTap = function() {
  var tableView = this.tableView;
  
  var viewStack = tableView.getViewStack();
  if (!viewStack) return;
  
  var data = this.getData();
  if (!data) return;
  
  var i, dayDataSource = [], yearDataSource = [];
  for (i = 1; i <= 31; i++) dayDataSource.push({ value: i, title: i + '' });
  for (i = 1970; i <= 2100; i++) yearDataSource.push({ value: i, title: i + '' });
  
  var monthDataSource = [
    { value: 1,  title: 'January'   }, { value: 2,  title: 'February' },
    { value: 3,  title: 'March'     }, { value: 4,  title: 'April'    },
    { value: 5,  title: 'May'       }, { value: 6,  title: 'June'     },
    { value: 7,  title: 'July'      }, { value: 8,  title: 'August'   },
    { value: 9,  title: 'September' }, { value: 10, title: 'October'  },
    { value: 11, title: 'November'  }, { value: 12, title: 'December' }
  ];
  
  var dateParts = this.getValue(), currentDate = new Date();
  if (!dateParts || (typeof dateParts !== 'string')) dateParts = currentDate.getFullYear() + '-' + (currentDate.getMonth() + 1) + '-' + currentDate.getDate();
  dateParts = dateParts.split('-');
  
  var year = window.parseInt(dateParts[0], 10);
  var month = window.parseInt(dateParts[1], 10);
  var day = window.parseInt(dateParts[2], 10);
  
  year = { value: year, title: year + '' };
  day = { value: day, title: day + '' };
  
  for (i = 0; i < 12; i++) if (monthDataSource[i].value === month) {
    month = monthDataSource[i];
    break;
  }
  
  if (!month || !month.value) month = monthDataSource[0];
  
  var dataSource = new Pushpop.TableViewDataSource([
    {
      reuseIdentifier: 'pp-select-input-table-view-cell',
      title: 'Month',
      name: 'month',
      value: month,
      childDataSource: monthDataSource
    },
    {
      reuseIdentifier: 'pp-select-input-table-view-cell',
      title: 'Day',
      name: 'day',
      value: day,
      childDataSource: dayDataSource
    },
    {
      reuseIdentifier: 'pp-select-input-table-view-cell',
      title: 'Year',
      name: 'year',
      value: year,
      childDataSource: yearDataSource
    }
  ]);
  
  var self = this;
  
  // Push a new view with a large text area input.
  viewStack.pushNewTableView(function(newTableView) {
    newTableView.setDataSource(dataSource);
    
    var newView = newTableView.getView();
    newView.setTitle($.trim((data && data.title) ? data.title : 'Date'));
    newView.addBarButtonItem(new Pushpop.Button('Done', function(button) {
      var value = dataSource.getValuesObject();
      var year = value.year.value;
      var month = value.month.value;
      var day = value.day.value;
      
      self.setValue(year + '-' + (month < 10 ? '0' : '') + month + '-' + (day < 10 ? '0' : '') + day);
      tableView.reloadData();
      viewStack.pop();
    }, Pushpop.Button.ButtonAlignmentType.Right, Pushpop.Button.ButtonStyleType.Blue));
  });
};

// Register the prototype for Pushpop.DateInputTableViewCell as a reusable cell type.
Pushpop.TableView.registerReusableCellPrototype(Pushpop.DateInputTableViewCell.prototype);

/**
  Creates a new table view cell for a TableView with a small bold blue text label
  and a black bold time value. When this type of cell is tapped, a table view is
  presented that allows the user to select a time.
  @param {String} reuseIdentifier A string containing an identifier that is unique
  to the group of cells that this cell should belong to.
  @constructor
  @extends Pushpop.TableViewCell
*/
Pushpop.TimeInputTableViewCell = function TimeInputTableViewCell(reuseIdentifier) {
  
  // Call the "super" constructor.
  Pushpop.TableViewCell.prototype.constructor.apply(this, arguments);
};

Pushpop.TimeInputTableViewCell.prototype = new Pushpop.TableViewCell('pp-time-input-table-view-cell');
Pushpop.TimeInputTableViewCell.prototype.constructor = Pushpop.TimeInputTableViewCell;

Pushpop.TimeInputTableViewCell.prototype.getHtml = function() {
  var data = this.getData();
  var title = $.trim((data && data.title) ? data.title : '&nbsp;');
  var value = $.trim((data && data.value) ? data.value : '&nbsp;');
  return '<h1>' + title + '</h1><h2>' + value + '</h2>';
};

Pushpop.TimeInputTableViewCell.prototype.getAccessoryType = function() { return this._accessoryType || Pushpop.TableViewCell.AccessoryType.DisclosureIndicator; };

Pushpop.TimeInputTableViewCell.prototype.didReceiveTap = function() {
  var tableView = this.tableView;
  
  var viewStack = tableView.getViewStack();
  if (!viewStack) return;
  
  var data = this.getData();
  if (!data) return;
  
  var i, hourDataSource = [], minuteDataSource = [];
  for (i = 0; i <= 23; i++) hourDataSource.push({ value: (i < 10 ? '0' : '') + i, title: (i < 10 ? '0' : '') + i });
  for (i = 0; i <= 59; i++) minuteDataSource.push({ value: (i < 10 ? '0' : '') + i, title: (i < 10 ? '0' : '') + i });
  
  var timeParts = this.getValue(), currentTime = new Date();
  if (!timeParts || (typeof timeParts !== 'string')) timeParts = currentTime.getHours() + ':' + currentTime.getMinutes();
  timeParts = timeParts.split(':');
  
  var hour = window.parseInt(timeParts[0], 10);
  var minute = window.parseInt(timeParts[1], 10);
  
  hour = { value: (hour < 10 ? '0' : '') + hour, title: (hour < 10 ? '0' : '') + hour };
  minute = { value: (minute < 10 ? '0' : '') + minute, title: (minute < 10 ? '0' : '') + minute };
  
  var dataSource = new Pushpop.TableViewDataSource([
    {
      reuseIdentifier: 'pp-select-input-table-view-cell',
      title: 'Hour',
      name: 'hour',
      value: hour,
      childDataSource: hourDataSource
    },
    {
      reuseIdentifier: 'pp-select-input-table-view-cell',
      title: 'Minute',
      name: 'minute',
      value: minute,
      childDataSource: minuteDataSource
    }
  ]);
  
  var self = this;
  
  // Push a new view with a large text area input.
  viewStack.pushNewTableView(function(newTableView) {
    newTableView.setDataSource(dataSource);
    
    var newView = newTableView.getView();
    newView.setTitle($.trim((data && data.title) ? data.title : 'Time'));
    newView.addBarButtonItem(new Pushpop.Button('Done', function(button) {
      var value = dataSource.getValuesObject();
      var hour = value.hour.value;
      var minute = value.minute.value;
      
      self.setValue(hour + ':' + minute);
      tableView.reloadData();
      viewStack.pop();
    }, Pushpop.Button.ButtonAlignmentType.Right, Pushpop.Button.ButtonStyleType.Blue));
  });
};

// Register the prototype for Pushpop.TimeInputTableViewCell as a reusable cell type.
Pushpop.TableView.registerReusableCellPrototype(Pushpop.TimeInputTableViewCell.prototype);

$(function() {
  var tableViews = Pushpop.tableViews = Pushpop.tableViews || {};
  
  $('.pp-table-view').each(function(index, element) {
    var tableView = new Pushpop.TableView(element);
    if (element.id) tableViews[Pushpop.Util.convertDashedStringToCamelCase(element.id)] = tableView;
  });
});
