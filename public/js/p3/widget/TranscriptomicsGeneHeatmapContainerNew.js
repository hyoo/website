define([
  'dojo/_base/declare', 'dojo/_base/lang',
  'dojo/on', 'dojo/topic', 'dojo/dom-construct', 'dojo/query', 'dojo/when',
  'dijit/layout/ContentPane', 'dijit/layout/BorderContainer', 'dijit/TooltipDialog', 'dijit/Dialog', 'dijit/popup',
  'dijit/TitlePane', 'dijit/registry', 'dijit/form/Form', 'dijit/form/RadioButton', 'dijit/form/Select', 'dijit/form/Button',
  './ContainerActionBar', './HeatmapContainerNew', './SelectionToGroup', 'FileSaver',
  'heatmap/dist/hotmap', 'dojo/dom-class'
], function (
  declare, lang,
  on, Topic, domConstruct, Query, when,
  ContentPane, BorderContainer, TooltipDialog, Dialog, popup,
  TitlePane, registry, Form, RadioButton, Select, Button,
  ContainerActionBar, HeatmapContainerNew, SelectionToGroup, saveAs,
  Hotmap, domClass
) {

  return declare([BorderContainer, HeatmapContainerNew], {
    gutters: false,
    state: null,
    visible: false,
    tgState: null,
    containerActions: [
      [
        'Flip Axis',
        'fa icon-rotate-left fa-2x',
        { label: 'Flip Axis', multiple: false, validTypes: ['*'] },
        'flipAxis',
        true
      ],
      [
        'Cluster',
        'fa icon-cluster fa-2x',
        { label: 'Cluster', multiple: false, validTypes: ['*'] },
        'cluster',
        true
      ],
      [
        'Advanced Clustering',
        'fa icon-cluster fa-2x',
        { label: 'Advanced', multiple: false, validTypes: ['*'] },
        function () {
          var self = this;

          this.dialog.set('content', this._buildPanelAdvancedClustering());

          // building action bar
          var actionBar = domConstruct.create('div', {
            'class': 'dijitDialogPaneActionBar'
          });
          var btnSubmit = new Button({
            label: 'Submit',
            onClick: function () {
              var param = {};
              var f = registry.byId('advancedClusterParams').value;

              param.g = (f.cluster_by === 3 || f.cluster_by === 1) ? f.algorithm : 0;
              param.e = (f.cluster_by === 3 || f.cluster_by === 2) ? f.algorithm : 0;
              param.m = f.type;

              self.cluster(param);
              self.dialog.hide();
            }
          });
          var btnCancel = new Button({
            label: 'Cancel',
            onClick: function () {
              self.dialog.hide();
            }
          });
          btnSubmit.placeAt(actionBar);
          btnCancel.placeAt(actionBar);

          domConstruct.place(actionBar, this.dialog.containerNode, 'last');

          this.dialog.show();
        },
        true
      ],
      [
        'Show Significant',
        'fa icon-filter fa-2x',
        { label: 'Show', multiple: false, validTypes: ['*'] },
        function () {
          if (this.containerActionBar._actions['Show Significant'].options.tooltipDialog == null) {
            this.tooltip_show_significant = new TooltipDialog({
              content: this._buildPanelShowSignificant()
            });
            this.containerActionBar._actions['Show Significant'].options.tooltipDialog = this.tooltip_show_significant;
          }

          if (this.isPopupOpen) {
            this.isPopupOpen = false;
            popup.close();
          } else {

            popup.open({
              parent: this,
              popup: this.containerActionBar._actions['Show Significant'].options.tooltipDialog,
              around: this.containerActionBar._actions['Show Significant'].button,
              orient: ['below']
            });
            this.isPopupOpen = true;
          }
        },
        true
      ]
    ],
    constructor: function (options) {
      this.dialog = new Dialog({});

      this.topicId = options.topicId;
      // subscribe
      Topic.subscribe(this.topicId, lang.hitch(this, function () {
        var key = arguments[0],
          value = arguments[1];

        switch (key) {
          case 'updateTgState':
            this.tgState = value;
            this.hmapUpdate();
            break;
          case 'refreshHeatmap':
            this.hmapUpdate();
            Topic.publish(this.topicId, 'requestHeatmapData', this.tgState);
            break;
          case 'updateHeatmapData':
            this.currentData = value;
            this.hmapUpdate();
            Topic.publish(this.topicId, 'hideLoadingMask');
            break;
          default:
            break;
        }
      }));
    },

    _setVisibleAttr: function (visible) {
      this.visible = visible;

      if (this.visible && !this._firstView) {
        this.initContainer();
        this.initializeHeatmap();
        this.onFirstView();
      }
    },

    initContainer: function () {
      var panel = this.panel = new ContentPane({
        region: 'center',
        content: "<div id='heatmapTarget'></div>",
        style: 'padding:0; overflow: hidden;'
      });

      dojo.connect(panel, 'resize', this, 'onResize');
      this.addChild(panel);
    },

    onResize: function () {
      if (!this.chart) return;
      this.chart.resize();
    },

    onFirstView: function () {
      if (this._firstView) {
        return;
      }

      // action buttons for heatmap viewer
      this.containerActionBar = new ContainerActionBar({
        baseClass: 'BrowserHeader',
        region: 'top'
      });

      this.inherited(arguments);
      this._firstView = true;
    },
    flashReady: function () {
      if (typeof (this.flashDom.refreshData) == 'function') {
        Topic.publish(this.topicId, 'refreshHeatmap');
      }
    },
    hmapCellClicked: function (colID, rowID) {
      var isTransposed = (this.tgState.heatmapAxis === 'Transposed');
      var originalAxis = this._getOriginalAxis(isTransposed, colID, rowID);

      var geneId = originalAxis.columnIds;
      var comparisonId = originalAxis.rowIds;

      this.dialog.set('content', this._buildPanelCellClicked(isTransposed, geneId, comparisonId));
      var actionBar = this._buildPanelButtons(colID, rowID, geneId, comparisonId);
      domConstruct.place(actionBar, this.dialog.containerNode, 'last');

      this.dialog.show();

    },
    hmapCellsSelected: function (colIDs, rowIDs) {
      if (rowIDs.length == 0) return;
      var isTransposed = (this.tgState.heatmapAxis === 'Transposed');
      var originalAxis = this._getOriginalAxis(isTransposed, colIDs, rowIDs);

      var geneIds = originalAxis.columnIds;
      var comparisonIds = originalAxis.rowIds;

      this.dialog.set('content', this._buildPanelCellsSelected(isTransposed, geneIds, comparisonIds));
      var actionBar = this._buildPanelButtons(colIDs, rowIDs, geneIds, comparisonIds);
      domConstruct.place(actionBar, this.dialog.containerNode, 'last');

      this.dialog.show();
    },
    _buildPanelCellClicked: function (isTransposed, geneId, comparisonId) {

      var gfs = this.tgState.comparisonFilterStatus;

      var comparisonName = gfs[comparisonId].getLabel();
      var description = '';

      if (isTransposed) {
        // rows: genes, columns: comparisons
        this.currentData.rows.forEach(function (row) {
          if (row.rowID === geneId) {
            description = row.rowLabel;
          }
        });
      } else {
        this.currentData.columns.forEach(function (col) {
          if (col.colID === geneId) {
            description = col.colLabel;
          }
        });
      }

      var text = [];
      text.push('<b>Comparison:</b> ' + comparisonName);
      text.push('<b>Product:</b> ' + description);

      return text.join('<br>');
    },
    _buildPanelCellsSelected: function (isTransposed, geneIds, comparisonIds) {

      var text = [];
      text.push('<b>Number of comparisons selected:</b> ' + comparisonIds.length);
      text.push('<b>Number of features selected:</b> ' + geneIds.length);

      return text.join('<br>');
    },
    _buildPanelAdvancedClustering: function () {

      if (registry.byId('advancedClusterParams') !== undefined) {
        registry.byId('advancedClusterParams').destroyRecursive();
      }

      var form = new Form({
        id: 'advancedClusterParams'
      });

      var tp_dim = new TitlePane({
        title: 'Cluster by'
      }).placeAt(form.containerNode);

      new RadioButton({
        checked: false,
        value: 2,
        name: 'cluster_by',
        label: 'Genes'
      }).placeAt(tp_dim.containerNode);
      domConstruct.place('<label>Genes</label><br/>', tp_dim.containerNode, 'last');

      new RadioButton({
        checked: false,
        value: 1,
        name: 'cluster_by',
        label: 'Comparisons'
      }).placeAt(tp_dim.containerNode);
      domConstruct.place('<label>Comparisons</label><br/>', tp_dim.containerNode, 'last');

      new RadioButton({
        checked: true,
        value: 3,
        name: 'cluster_by',
        label: 'Both'
      }).placeAt(tp_dim.containerNode);
      domConstruct.place('<label>Both</label>', tp_dim.containerNode, 'last');

      var sel_algorithm = new Select({
        name: 'algorithm',
        value: 2,
        options: [{
          value: 0, label: 'No clustering'
        }, {
          value: 1, label: 'Un-centered correlation'
        }, {
          value: 2, label: 'Pearson correlation'
        }, {
          value: 3, label: 'Un-centered correlation, absolute value'
        }, {
          value: 4, label: 'Pearson correlation, absolute value'
        }, {
          value: 5, label: 'Spearman rank correlation'
        }, {
          value: 6, label: 'Kendall tau'
        }, {
          value: 7, label: 'Euclidean distance'
        }, {
          value: 8, label: 'City-block distance'
        }]
      });

      var sel_type = new Select({
        name: 'type',
        value: 'a',
        options: [{
          value: 'm', label: 'Pairwise complete-linkage'
        }, {
          value: 's', label: 'Pairwise single-linkage'
        }, {
          value: 'c', label: 'Pairwise centroid-linkage'
        }, {
          value: 'a', label: 'Pairwise average-linkage'
        }]
      });

      new TitlePane({
        title: 'Clustering algorithm',
        content: sel_algorithm
      }).placeAt(form.containerNode);

      new TitlePane({
        title: 'Clustering type',
        content: sel_type
      }).placeAt(form.containerNode);

      return form;
    },
    _buildPanelButtons: function (colIDs, rowIDs, geneIds, comparisonIds) {
      var _self = this;
      var actionBar = domConstruct.create('div', {
        'class': 'dijitDialogPaneActionBar'
      });

      var dhc = '<div>Download Table As...</div><div class="wsActionTooltip" rel="text/tsv">Text</div><div class="wsActionTooltip" rel="text/csv">CSV</div>';

      var dfc = '<div>Download Table As...</div><div class="wsActionTooltip" rel="text/tsv">Text</div><div class="wsActionTooltip" rel="text/csv">CSV</div><div class="wsActionTooltip" rel="application/vnd.openxmlformats">Excel</div>';
      var downloadHM = new TooltipDialog({
        content: dhc,
        onMouseLeave: function () {
          popup.close(downloadHM);
        }
      });
      var downloadPT = new TooltipDialog({
        content: dfc,
        onMouseLeave: function () {
          popup.close(downloadPT);
        }
      });

      var btnDownloadHeatmap = new Button({
        label: 'Download Heatmap Data'
      });
      on(downloadHM.domNode, 'click', function (e) {
        if (e.target.attributes.rel === undefined) return;
        var rel = e.target.attributes.rel.value;
        var DELIMITER,
          ext;
        if (rel === 'text/csv') {
          DELIMITER = ',';
          ext = 'csv';
        } else {
          DELIMITER = '\t';
          ext = 'txt';
        }

        var colIndexes = [];
        _self.currentData.columns.forEach(function (col, idx) {
          if (colIDs.indexOf(col.colID) > -1) {
            colIndexes[colIDs.indexOf(col.colID)] = idx;
          }
        });

        var header = _self.currentData.rowLabel + '/' + _self.currentData.colLabel;
        colIndexes.forEach(function (colIdx) {
          header += DELIMITER + _self.currentData.columns[colIdx].colLabel;
        });

        var data = [];
        _self.currentData.rows.forEach(function (row, idx) {
          if (rowIDs.indexOf(row.rowID) > -1) {
            var r = [];
            r.push(row.rowLabel);
            colIndexes.forEach(function (colIdx) {
              var val = _self.currentData.columns[colIdx].meta.samples[row.rowID].log_ratio;
              r.push(val);
            });
            data[rowIDs.indexOf(row.rowID)] = r.join(DELIMITER);
          }
        });

        saveAs(new Blob([header + '\n' + data.join('\n')], { type: rel }), 'PATRIC_transcriptomics_heatmap.' + ext);
        popup.close(downloadHM);
      });
      on(btnDownloadHeatmap.domNode, 'click', function () {
        popup.open({
          popup: downloadHM,
          around: btnDownloadHeatmap.domNode,
          orient: ['below']
        });
      });

      var btnDownloadProteins = new Button({
        label: 'Download Genes'
      });
      on(downloadPT.domNode, 'click', function (e) {
        if (e.target.attributes.rel === undefined) return;
        var rel = e.target.attributes.rel.value;
        var currentQuery = '?in(feature_id,(' + geneIds + '))&sort(+feature_id)';

        window.open(window.App.dataServiceURL + '/genome_feature/' + currentQuery + '&http_authorization=' + encodeURIComponent(window.App.authorizationToken) + '&http_accept=' + rel + '&http_download=true');
        popup.close(downloadPT);
      });

      on(btnDownloadProteins.domNode, 'click', function () {
        popup.open({
          popup: downloadPT,
          around: btnDownloadProteins.domNode,
          orient: ['below']
        });
      });

      var btnShowDetails = new Button({
        label: 'Show Genes'
      });
      on(btnShowDetails.domNode, 'click', function () {
        if (typeof (geneIds) == 'object') {
          Topic.publish('/navigate', { href: '/view/FeatureList/?in(feature_id,(' + geneIds + '))#view_tab=features', target: 'blank' });
        } else {
          Topic.publish('/navigate', { href: '/view/Feature/' + geneIds, target: 'blank' });
        }
        _self.dialog.hide();
      });

      var btnAddToWorkspace = new Button({
        label: 'Add Proteins to Group',
        onClick: function () {
          var dlg = new Dialog({ title: 'Add selected items to group' });

          var stg = new SelectionToGroup({
            selection: geneIds.map(function (id) { return { feature_id: id }; }),
            type: 'feature_group',
            path: this.get('path')
          });

          on(dlg.domNode, 'dialogAction', function (evt) {
            dlg.hide();
            setTimeout(function () {
              dlg.destroy();
            }, 2000);
          });
          domConstruct.place(stg.domNode, dlg.containerNode, 'first');
          stg.startup();
          dlg.startup();
          dlg.show();
        }
      });

      var btnCancel = new Button({
        label: 'Cancel',
        onClick: function () {
          _self.dialog.hide();
        }
      });

      btnDownloadHeatmap.placeAt(actionBar);
      btnDownloadProteins.placeAt(actionBar);
      btnShowDetails.placeAt(actionBar);
      btnAddToWorkspace.placeAt(actionBar);
      btnCancel.placeAt(actionBar);

      return actionBar;
    },
    _buildPanelColorTheme: function () {
      var self = this;
      var colorSelect = new Select({
        name: 'colorTheme',
        options: [{ value: 'rgb', label: '<i class="fa icon-arrow-up"></i> Red-Black-Green <i class="fa icon-arrow-down"></i>' },
          { value: 'rbw', label: '<i class="fa icon-arrow-up"></i> Red-White-Blue <i class="fa icon-arrow-down"></i>' }]
      });
      colorSelect.on('change', lang.hitch(self, function (scheme) {
        self.currentData.colorStops = self.getColorStops(scheme, self.tgState.maxIntensity);
        self.flashDom.refreshData();
        popup.close();
      }));

      return colorSelect;
    },
    _buildPanelShowSignificant: function () {

      var showSelect = new Select({
        name: 'showSignificant',
        options: [{ value: 'Y', label: 'Significant Genes' },
          { value: 'N', label: 'All Genes' }]
      });
      showSelect.on('change', lang.hitch(this, function (yesOrNo) {
        this.tgState.significantGenes = yesOrNo;
        Topic.publish(this.topicId, 'applyConditionFilter', this.tgState);
        popup.close();
      }));

      return showSelect;
    },
    _getOriginalAxis: function (isTransposed, columnIds, rowIds) {
      var originalAxis = {};

      if (isTransposed) {
        originalAxis.columnIds = rowIds;
        originalAxis.rowIds = columnIds;
      } else {
        originalAxis.columnIds = columnIds;
        originalAxis.rowIds = rowIds;
      }
      return originalAxis;
    },
    // override exportCurrentData in order to cluster on read value instead of heatmap value
    exportCurrentData: function (isTransposed) {
      // compose heatmap raw data in tab delimited format
      // this de-transpose (if it is transposed) so that cluster algorithm can be applied to a specific data type

      var cols,
        rows,
        id_field_name,
        data_field_name,
        tablePass = [],
        header = [''],
        readValues = [];

      if (isTransposed) {
        cols = this.currentData.rows;
        rows = this.currentData.columns;
        id_field_name = 'rowID';
        data_field_name = 'colID';
      } else {
        cols = this.currentData.columns;
        rows = this.currentData.rows;
        id_field_name = 'colID';
        data_field_name = 'rowID';
      }

      cols.forEach(function (col, colIdx) {
        header.push(col[id_field_name]);
        readValues[colIdx] = col.meta.labels.split('|');
      });

      tablePass.push(header.join('\t'));

      for (var i = 0, iLen = rows.length; i < iLen; i++) {
        var r = [];
        r.push(rows[i][data_field_name]);

        for (var j = 0, jLen = cols.length; j < jLen; j++) {
          r.push(readValues[j][i] || 0);
        }

        tablePass.push(r.join('\t'));
      }

      return tablePass.join('\n');
    },
    flipAxis: function () {
      // flip internal flag
      if (this.tgState.heatmapAxis === '') {
        this.tgState.heatmapAxis = 'Transposed';
      } else {
        this.tgState.heatmapAxis = '';
      }

      this.chart.flipAxis();
    },
    cluster: function (param) {
      var p = param || { g: 2, e: 2, m: 'a' };

      var isTransposed = this.tgState.heatmapAxis === 'Transposed';
      var data = this.exportCurrentData(isTransposed);

      if (data.length > 1500000) {
        new Dialog({
          title: 'Notice',
          content: 'The data set is too large to cluster. Please use filter panel to reduce the size',
          style: 'width: 300px'
        }).show();
        return;
      }

      Topic.publish(this.topicId, 'showLoadingMask');

      return when(window.App.api.data('cluster', [data, p]), lang.hitch(this, function (res) {
        // DO NOT TRANSPOSE. clustering process is based on the corrected axises
        this.tgState.clusterRowOrder = res.rows;
        this.tgState.clusterColumnOrder = res.columns;

        Topic.publish(this.topicId, 'updateTgState', this.tgState);
        Topic.publish(this.topicId, 'updateFilterGridOrder', res.rows);
        Topic.publish(this.topicId, 'updateMainGridOrder', res.columns);

        // re-draw heatmap
        Topic.publish(this.topicId, 'refreshHeatmap');
      }), function (err) {

        Topic.publish(this.topicId, 'hideLoadingMask');

        new Dialog({
          title: err.status || 'Error',
          content: err.text || err
        }).show();
      });
    },

    update: function () {
      Topic.publish(this.topicId, 'refreshHeatmap');
    },

    hmapUpdate: function () {
      var self = this;

      if (!this.currentData) return;
      var data = this.formatData(this.currentData);

      if (!this.chart) {
        this.chart = new Hotmap({
          ele: this.hmapDom,
          cols: data.cols,
          rows: data.rows,
          matrix: data.matrix,
          rowsLabel: 'Comparison',
          colsLabel: 'Genes',
          hideRowMeta: true,
          hideColMeta: true,
          options: {
            theme: 'light',
            maxFontSize: 13,
            hideOptions: true,
            useBoundingClient: true,
            legend: '⬆ red - black - green ⬇',
          },
          color: {
            bins: [
              '<-4', '<-3', '<-2', '<-1', '<0', '=0',
              '<=1', '<=2', '<=3', '<=4', '>4'
            ],
            colors: [
              0x00FF00, 0x00cc00, 0x009900, 0x006600, 0x003300, 0x000000,
              0x330000, 0x660000, 0x990000, 0xcc0000, 0xFF0000
            ]
          },
          onSelection: function (objs) {
            var colIDs = objs.map(function (c) { return c.colID; });
            var rowIDs = objs.map(function (r) { return r.rowID; });
            self.hmapCellsSelected(colIDs, rowIDs);
          },
          onClick: function (obj) {
            self.hmapCellClicked(obj.colID, obj.rowID);
          },
          onFullscreenClick: function () {
            console.log('there was click')
            // must also hide filter container
            domClass.toggle(Query('.filterPanel')[0], 'dijitHidden');
            domClass.toggle(Query('.dijitSplitterV')[0], 'dijitHidden');
            Query('.dijitSplitter').forEach(function (el) {
              domClass.toggle(el, 'dijitHidden');
            });

            setTimeout(function () {
              self.onResize();
            }, 500);
          }
        });

        this.containerActions.forEach(function (a) {
          this.containerActionBar.addAction(a[0], a[1], a[2], lang.hitch(this, a[3]), a[4]);
        }, this);

        // put action icons in heatmap header
        var header = Query('.hotmap .header', this.hmapDom)[0];
        domConstruct.place(this.containerActionBar.domNode, header, 'last');
        Query('.ActionButtonWrapper').style('width', '48px');

        // hack to remove unused path div (interfering with flexbox)
        Query('.wsBreadCrumbContainer', this.hmapDom)[0].remove();
      } else {
        this.chart.update({
          rows: data.rows,
          cols: data.cols,
          matrix: data.matrix
        });
      }
    },

    formatData: function (data) {
      var rows = data.rows.map(function (r) {
        return {
          name: r.rowLabel,
          id: r.rowID
        };
      });
      var cols = data.columns.map(function (c) {
        return {
          name: c.colLabel,
          id: c.colID,
          meta: c.meta
        };
      });

      // get lists of vals for each column
      var vals = cols.map(function (c) {
        vals = c.meta.labels.split('|');
        return vals;
      });

      // make pass of all column val data (i times, where i = number of rows)
      var matrix = [];
      for (var i = 0; i < vals[0].length; i++) {
        var row = [];
        for (var j = 0; j < vals.length; j++) {
          row.push(vals[j][i]);
        }
        matrix.push(row);
      }

      return { cols: cols, rows: rows, matrix: matrix };
    }

  });
});
