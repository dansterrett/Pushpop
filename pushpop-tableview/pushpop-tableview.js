'use strict';

if (!window['Pushpop']) window.Pushpop = {};

(function() {
  var kMaximumTapArea = 5;
  
  var _$window = $(window['addEventListener'] ? window : document.body);
  var _lastPickerViewId = 0;
  
  if (!Pushpop['EventType']) Pushpop.EventType = {};
  $.extend(Pushpop.EventType, {
    WillSelectCell: 'Pushpop:WillSelectCell',
    DidSelectCell: 'Pushpop:DidSelectCell',
    AccessoryButtonTapped: 'Pushpop:AccessoryButtonTapped'
  });
  
  Pushpop.TableView = function(element) {
    var _$activeCellElement = null;
    var _$activeCellLinkElement = null;
    var _isMouseDown = false;
    var _isAccessoryButtonPressed = false;
    
    var $element = this.$element = $(element);
    
    var tableview = $element.data('tableview');
    if (tableview) return tableview;
    
    $element.data('tableview', this);
    
    element = this.element = $element[0];
    
    var $pickerCells = $element.children('.pp-tableview-picker-cell');
    $pickerCells.each(function(index, element) {
      new Pushpop.TableViewPickerCell(element);
    });
    
    var activeCellLinkClickHandler = function(evt) {
      $(this).unbind(evt);
      evt.stopImmediatePropagation();
      evt.preventDefault();
    };
    
    $element.delegate('li', 'mousedown touchstart', function(evt) {
      _isMouseDown = (evt.type === 'mousedown' && !Modernizr.touch) || evt.type === 'touchstart';
      
      _$activeCellElement = $(this);
      _$activeCellLinkElement = _$activeCellElement.children('a:first');
      _$activeCellLinkElement.unbind('click', activeCellLinkClickHandler);
      
      var $accessoryButtonElement = $('<div class="pp-tableview-accessory-button"/>');
      _$activeCellElement.append($accessoryButtonElement);
      
      var mouseX = (evt.type === 'touchstart') ? evt.originalEvent.targetTouches[0].pageX : evt.pageX;
      var mouseY = (evt.type === 'touchstart') ? evt.originalEvent.targetTouches[0].pageY : evt.pageY;
      var accessoryOffset = $accessoryButtonElement.offset();
      var accessoryWidth = $accessoryButtonElement.width();
      var accessoryHeight = $accessoryButtonElement.height();
      
      _isAccessoryButtonPressed = (
        (mouseX >= accessoryOffset.left && mouseX <= accessoryOffset.left + accessoryWidth) &&
        (mouseY >= accessoryOffset.top  && mouseY <= accessoryOffset.top  + accessoryHeight)
      );
      
      $accessoryButtonElement.remove();
      
      if (_isMouseDown) {
        if (!_isAccessoryButtonPressed) _$activeCellElement.addClass('active');
      } else {      
        _$activeCellLinkElement.bind('click', activeCellLinkClickHandler);
      }
    });
    
    _$window.bind('mousemove touchmove', function(evt) {
      if (!_isMouseDown) return;
      
      _$activeCellLinkElement.unbind('click', activeCellLinkClickHandler);
      _$activeCellLinkElement.bind('click', activeCellLinkClickHandler);
      
      _$activeCellElement.removeClass('active');
      
      _$activeCellElement = null;
      _$activeCellLinkElement = null;
      _isMouseDown = false;
      _isAccessoryButtonPressed = false;
    });
    
    _$window.bind('mouseup touchend', function(evt) {
      if (!_isMouseDown) return;
      
      var index = _$activeCellElement.index();
      var activeCellElement = _$activeCellElement[0];
      
      if (!_isAccessoryButtonPressed) {
        $element.trigger(jQuery.Event(Pushpop.EventType.WillSelectCell, {
          cellElement: activeCellElement,
          $cellElement: _$activeCellElement,
          index: index
        }));
      }
      
      if (evt.type === 'touchend') {
        _$activeCellLinkElement.unbind('click', activeCellLinkClickHandler);
        _$activeCellLinkElement.trigger('click');
      }
      
      if (!_isAccessoryButtonPressed) {
        $element.trigger(jQuery.Event(Pushpop.EventType.DidSelectCell, {
          cellElement: activeCellElement,
          $cellElement: _$activeCellElement,
          index: index
        }));
      } else {
        $element.trigger(jQuery.Event(Pushpop.EventType.AccessoryButtonTapped, {
          cellElement: activeCellElement,
          $cellElement: _$activeCellElement,
          index: index
        }));
      }
      
      _$activeCellElement.removeClass('active');
      
      _$activeCellElement = null;
      _$activeCellLinkElement = null;
      _isMouseDown = false;
      _isAccessoryButtonPressed = false;
    });
    
    $element.bind(Pushpop.EventType.DidSelectCell, function(evt) {
      var $cellElement = evt.$cellElement;
      
      if ($cellElement.hasClass('pp-tableview-picker-cell')) {
        var pickerCell = $cellElement.data('pickerCell');
        if (pickerCell) pickerCell.show();
      }
    });
    
    $element.bind(Pushpop.EventType.AccessoryButtonTapped, function(evt) {
      var $cellElement = evt.$cellElement;
      
      if ($cellElement.hasClass('delete-button')) {
        if ($cellElement.hasClass('pp-tableview-picker-value-cell')) {
          var pickerCell = $cellElement.data('pickerCell');
          if (pickerCell) pickerCell.removeValue($cellElement.data('value'));
        }
      }
    });
  };

  Pushpop.TableView.prototype = {
    element: null,
    $element: null,
    getView: function() {
      return this.$element.parents('.pp-view:first').data('view');
    }
  };

  Pushpop.TableViewPickerCell = function(element) {
    var _isMouseDown = false;
    
    var $element = this.$element = $(element);
  
    var pickerCell = $element.data('pickerCell');
    if (pickerCell) return pickerCell;
  
    $element.data('pickerCell', this);
    
    element = this.element = $element[0];
    
    var self = this;
    
    var isMultiple = this.isMultiple = $element.data('multiple') ? true : false;
    if (isMultiple) $element.addClass('add-button');
    
    var viewStack = this.getParentTableView().getView().getViewStack();
    var $viewElement = $('<div class="pp-view sk-scroll-view" id="pp-tableview-picker-view-' + (++_lastPickerViewId) + '"/>');
    viewStack.$element.append($viewElement);
    
    var scrollView = new SKScrollView($viewElement);
    var $scrollViewContentElement = scrollView.content.$element;
    var view = this.view = new Pushpop.View($viewElement);
    var $tableViewElement = $element.children('.pp-tableview');
    var tableView = this.tableView = new Pushpop.TableView($tableViewElement);
    $scrollViewContentElement.append($tableViewElement);
    
    var $selectedTextElement = this.$selectedTextElement = $('<span/>').appendTo($element);
    var values = (($element.data('value') || '') + '').split(',');
    
    this._value = [];
    
    if (isMultiple) {
      for (var i = 0, length = values.length; i < length; i++) this.setValue(values[i]);
    } else {
      if (values.length > 0) this.setValue(values[0]);
    }
    
    $tableViewElement.bind(Pushpop.EventType.DidSelectCell, function(evt) {
      var $oldSelectedCellElements = $tableViewElement.children('.checkmark');
      var $cellElement = evt.$cellElement;
      var value = $cellElement.data('value');
      
      if (self.isMultiple) {
        self.setValue(value, true);
      } else {
        self.setValue(value);
      }
      
      viewStack.pop();
    });
  };

  Pushpop.TableViewPickerCell.prototype = {
    _value: null,
    element: null,
    $element: null,
    $selectedTextElement: null,
    view: null,
    tableView: null,
    isMultiple: false,
    getParentTableView: function() {
      return this.$element.parents('.pp-tableview:first').data('tableview');
    },
    getTextByValue: function(value) {
      return this.tableView.$element.children('[data-value="' + value + '"]:first').text();
    },
    getValue: function() {
      return this._value;
    },
    setValue: function(value) {
      var $element = this.$element;
      var $tableViewElement = this.tableView.$element;
      var isMultiple = this.isMultiple;
      var text = this.getTextByValue(value);
      
      if (isMultiple) {
        for (var i = 0, length = this._value.length; i < length; i++) if (this._value[i] == value) return;
        
        this._value.push(value);
        $element.attr('data-value', this._value.join(',')).data('value', this._value);
        this.$selectedTextElement.html(null);
        
        var $valueCellElement = $('<li class="pp-tableview-picker-value-cell delete-button" data-value="' + value + '">' + text + '</li>');
        $valueCellElement.data('pickerCell', this);
        $element.before($valueCellElement);
        $tableViewElement.children('[data-value="' + value + '"]:first').addClass('checkmark');
      } else {
        this._value = [value];
        $element.attr('data-value', this._value.join(',')).data('value', this._value);
        this.$selectedTextElement.html(text);
        
        $tableViewElement.children('.checkmark').removeClass('checkmark');
        $tableViewElement.children('[data-value="' + value + '"]:first').addClass('checkmark');
      }
    },
    removeValue: function(value) {
      var $element = this.$element;
      var isMultiple = this.isMultiple;
      
      if (isMultiple) {
        var index;
        
        for (var i = 0, length = this._value.length; i < length; i++) {
          if (this._value[i] == value) {
            index = i;
            break;
          }
        }
        
        if (index === undefined) return;
        
        this._value.splice(index, 1);
        
        var $tableViewElement = this.tableView.$element;
        $tableViewElement.children('[data-value="' + value + '"]:first').removeClass('checkmark');
        $element.prevAll('[data-value="' + value + '"]:first').remove();
      } else {
        this._value = [];
      }
      
      $element.attr('data-value', this._value.join(',')).data('value', this._value);
      this.$selectedTextElement.html(null);
    },
    show: function() {
      var view = this.view;
      var viewStack = view.getViewStack();
      
      viewStack.push(view);
    }
  };
})();

$(function() {
  var $tableviews = $('.pp-tableview');
  $tableviews.each(function(index, element) {
    new Pushpop.TableView(element);
  });
});
