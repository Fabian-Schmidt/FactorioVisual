/// <reference path="typings/jquery/jquery.d.ts" />
/// <reference path="factoriovisual.ts" />
/// <reference path="typings/angularjs/angular.d.ts" />
'use strict';
jQuery(function () {
    var app = angular.module('app', ['angular.filter']);
    app.factory('factorioData', FactorioVisualAngular.factorioData);
    app.factory('factorioGraph', FactorioVisualAngular.factorioGraph);
    app.controller('selectController', FactorioVisualAngular.selectController);
    app.controller('graphController', FactorioVisualAngular.graphController);
});
var FactorioVisualAngular;
(function (FactorioVisualAngular) {
    ;
    function factorioData($q) {
        var factorioData;
        var deferred = $q.defer();
        factorio.dataLoadedPromise.then(function () {
            var data = this;
            deferred.resolve(data);
        });
        factorioData = function () {
            return deferred.promise;
        };
        //factorioData.listeners = {};
        //function fire(e, args) {
        //    var listeners = factorioData.listeners[e];
        //    for (var i = 0; listeners && i < listeners.length; i++) {
        //        var fn = listeners[i];
        //        fn.apply(fn, args);
        //    }
        //}
        //function listen(e, fn) {
        //    var listeners = factorioData.listeners[e] = factorioData.listeners[e] || [];
        //    listeners.push(fn);
        //}
        //factorioData.setPersonWeight = function (id, weight) {
        //    //cy.$('#' + id).data('weight', weight);
        //};
        //factorioData.onWeightChange = function (fn) {
        //    listen('onWeightChange', fn);
        //};
        return factorioData;
    }
    FactorioVisualAngular.factorioData = factorioData;
    factorioData.$inject = ['$q'];
    ;
    ;
    ;
    function factorioGraph($q, factorioData) {
        var factorioGraph;
        var cyOfRecipe;
        var itemGroups;
        itemGroups = [];
        var itemSubGroups;
        itemSubGroups = {};
        var deferred = $q.defer();
        factorioData().then(function (data) {
            for (var key in data['item-group']) {
                var group = data['item-group'][key];
                if (group.name != 'other' && group.name != 'enemies' && group.name != 'environment') {
                    itemGroups.push({
                        name: group.name,
                        inventory_order: group.inventory_order,
                        order: group.order,
                        icon: factorio.iconConfigToURI(group.icon)
                    });
                }
            }
            for (var key in data['item-subgroup']) {
                var group = data['item-subgroup'][key];
                itemSubGroups[group.name] = {
                    name: group.name,
                    group: group.group,
                    order: group.order
                };
            }
            var nodes = [];
            var edges = [];
            var recipes;
            recipes = data.recipe;
            var productToNode = {};
            for (var key in recipes) {
                var recipe = recipes[key];
                var node = {
                    classes: 'recipe',
                    data: {
                        id: recipe.name,
                        name: recipe.name,
                        result: recipe.result,
                        result_count: recipe.result_count == undefined ? 1 : recipe.result_count,
                        category: recipe.category == undefined ? 'crafting' : recipe.category,
                        subgroup: recipe.subgroup,
                        energy_required: recipe.energy_required,
                        icon: factorio.factorioFolder + 'data/base/graphics/terrain/blank.png',
                        order: undefined
                    }
                };
                nodes.push(node);
                if (productToNode[recipe.result] == undefined)
                    productToNode[recipe.result] = [];
                productToNode[recipe.result].push(node);
            }
            //Create edges from  ingredients
            for (var key in recipes) {
                var recipe = recipes[key];
                for (var key in recipe.ingredients) {
                    var ingredient = recipe.ingredients[key];
                    if (ingredient.name == undefined) {
                        ingredient.name = ingredient[1];
                    }
                    if (ingredient.amount == undefined) {
                        ingredient.amount = ingredient[2];
                    }
                    var sourceProducts = productToNode[ingredient.name];
                    if (sourceProducts == undefined) {
                        //source Product not found. It is not a ingredient. Must be a raw resource.
                        //create it
                        productToNode[ingredient.name] = [{
                                classes: 'recipe onlyIngredient',
                                data: {
                                    id: ingredient.name,
                                    name: ingredient.name,
                                    result: ingredient.name,
                                    result_count: undefined,
                                    category: undefined,
                                    subgroup: undefined,
                                    energy_required: undefined,
                                    icon: factorio.factorioFolder + 'data/base/graphics/terrain/blank.png',
                                    order: undefined
                                }
                            }];
                        nodes.push(productToNode[ingredient.name][0]);
                        sourceProducts = productToNode[ingredient.name];
                    }
                    //create connection to source products. If more than one mark it.
                    for (var key in sourceProducts) {
                        var sourceProduct = sourceProducts[key];
                        edges.push({
                            classes: sourceProducts.length > 1 ? 'recipe ingredientChoice' : 'recipe',
                            data: {
                                source: sourceProduct.data.id,
                                target: recipe.name,
                                amount: ingredient.amount
                            }
                        });
                    }
                }
            }
            //Find icon for Products
            for (var key in data) {
                //if (key != 'recipe') {
                var dataGroup = data[key];
                for (var key in dataGroup) {
                    var dataElement = dataGroup[key];
                    if (dataElement.icon != undefined) {
                        var products = productToNode[dataElement.name];
                        if (products != undefined) {
                            for (var key in products) {
                                var product = products[key];
                                product.data['icon'] = factorio.iconConfigToURI(dataElement.icon);
                                if (dataElement.subgroup != undefined) {
                                    product.data['subgroup'] = dataElement.subgroup;
                                    product.classes += " " + itemSubGroups[dataElement.subgroup].group;
                                }
                                if (dataElement.order != undefined)
                                    product.data['order'] = dataElement.order;
                                if (dataElement.category != undefined)
                                    product.data['category'] = dataElement.category;
                                if (dataElement.type != undefined)
                                    product.data['type'] = dataElement.type;
                            }
                        }
                    }
                }
            }
            cyOfRecipe = cytoscape({
                elements: {
                    nodes: nodes,
                    edges: edges
                }, headless: true,
                ready: function () {
                    deferred.resolve(factorioGraph);
                }
            });
        });
        factorioGraph = function () {
            return deferred.promise;
        };
        factorioGraph.products = function (itemGroup) {
            var ret;
            ret = {};
            var selector = '';
            if (itemGroup && itemGroup != undefined && itemGroup.length > 0) {
                selector = '.' + itemGroup;
            }
            cyOfRecipe.nodes(selector).forEach(function (ele) {
                //ret.push(ele.data());
                ret[ele.id()] = ele.data();
            });
            return ret;
        };
        factorioGraph.productsRelated = function (productName) {
            if (productName == undefined || productName.length < 3) {
                throw 'Invalid product name.';
            }
            var ret = [];
            cyOfRecipe.nodes('#' + productName).incomers().nodes().forEach(function (ele) {
                ret.push(ele.data());
            });
            cyOfRecipe.nodes('#' + productName).outgoers().nodes().forEach(function (ele) {
                ret.push(ele.data());
            });
            return ret;
        };
        factorioGraph.productsRelatedCollection = function (productName) {
            if (productName == undefined || productName.length < 3) {
                throw 'Invalid product name.';
            }
            var ret = cyOfRecipe.collection();
            ret = ret.add(cyOfRecipe.nodes('#' + productName));
            ret = ret.add(cyOfRecipe.nodes('#' + productName).incomers());
            ret = ret.add(cyOfRecipe.nodes('#' + productName).outgoers());
            return ret;
        };
        factorioGraph.ingredients = function (productName) {
            return [];
        };
        factorioGraph.itemGroups = itemGroups;
        factorioGraph.itemSubGroups = itemSubGroups;
        return factorioGraph;
    }
    FactorioVisualAngular.factorioGraph = factorioGraph;
    factorioGraph.$inject = ['$q', 'factorioData'];
    var selectController = (function () {
        function selectController($scope, $rootScope, factorioGraph) {
            this.$scope = $scope;
            this.$rootScope = $rootScope;
            this.factorioGraph = factorioGraph;
            $scope.loaded = false;
            $scope.products = {};
            $scope.itemGroups = [];
            factorioGraph().then(function (data) {
                factorioGraph = data;
                $scope.loaded = true;
                $scope.itemGroups = factorioGraph.itemGroups;
            });
            $scope.onItemGroupSelect = function (itemGroup) {
                $scope.selectedItemGroup = itemGroup;
                $scope.products = factorioGraph.products(itemGroup.name);
            };
            $scope.onProductSelect = function (product) {
                $rootScope.$emit('factorio.selectProduct', product);
            };
            $rootScope.$on('factorio.selectProduct', function (event, product) {
                if (product.selected == undefined) {
                    product.selected = true;
                }
                else {
                    product.selected = !product.selected;
                }
            });
        }
        selectController.$inject = [
            '$scope',
            '$rootScope',
            'factorioGraph'
        ];
        return selectController;
    })();
    FactorioVisualAngular.selectController = selectController;
    var graphController = (function () {
        function graphController($scope, $rootScope, factorioGraph) {
            this.$scope = $scope;
            this.$rootScope = $rootScope;
            this.factorioGraph = factorioGraph;
            var that = this;
            factorioGraph().then(function (data) {
                factorioGraph = data;
                that.cy = cytoscape({
                    container: document.getElementById('cy-Recipe'),
                    elements: {
                        nodes: [],
                        edges: []
                    },
                    layout: {
                        name: 'breadthfirst',
                        fit: true,
                        directed: true,
                        padding: 100,
                        circle: false,
                        spacingFactor: 1.75,
                        boundingBox: undefined,
                        avoidOverlap: true,
                        roots: undefined,
                        maximalAdjustments: 0,
                        animate: false,
                        animationDuration: 500,
                        ready: undefined,
                        stop: undefined // callback on layoutstop
                    },
                    headless: false,
                    minZoom: 0.2,
                    maxZoom: 2,
                    style: [
                        {
                            selector: 'edge',
                            css: {
                                'width': 6,
                                'curve-style': 'bezier'
                            }
                        },
                        {
                            selector: 'node',
                            css: {
                                'height': 100,
                                'width': 100,
                                'background-fit': 'cover',
                                'border-color': '#000',
                                'border-width': 3,
                                'border-opacity': 0.5,
                                'content': 'data(name)',
                                //'shape': 'rectangle',
                                //'text-valign': 'center',
                                //'text-halign': 'center',
                                'background-image': 'data(icon)'
                            }
                        }, {
                            selector: 'node[displayCount > 0]',
                            css: {
                                'background-color': '#B5844E'
                            }
                        }],
                    ready: function () {
                        $scope.loaded = true;
                        that.cy.on('tap', function (evt) {
                            var product = evt.cyTarget.data();
                            $rootScope.$emit('factorio.selectProduct', product);
                        });
                    }
                });
            });
            $rootScope.$on('factorio.selectProduct', function (event, product) {
                var productName = product.name;
                var displayCount = that.cy.nodes('#' + productName).data('displayCount');
                if (displayCount == undefined || isNaN(displayCount)) {
                    displayCount = 0;
                }
                if (displayCount == 0) {
                    //Add this to graph
                    var productParents = factorioGraph.productsRelatedCollection(product.name);
                    productParents.forEach(function (ele) {
                        var usageCount = ele.data('usageCount');
                        if (usageCount == undefined || isNaN(usageCount)) {
                            usageCount = 0;
                        }
                        usageCount++;
                        ele.data('usageCount', usageCount);
                    });
                    that.cy.add(productParents);
                    that.cy.nodes('#' + productName).data('displayCount', ++displayCount);
                }
                else {
                    //Remove this from graph
                    var removeOneUsageFunc = function (ele) {
                        var usageCount = ele.data('usageCount');
                        if (usageCount == undefined || isNaN(usageCount)) {
                            usageCount = 0;
                        }
                        usageCount--;
                        ele.data('usageCount', usageCount);
                    };
                    that.cy.nodes('#' + productName).data('displayCount', --displayCount);
                    that.cy.nodes('#' + productName).forEach(removeOneUsageFunc);
                    that.cy.nodes('#' + productName).incomers().nodes().forEach(removeOneUsageFunc);
                    that.cy.nodes('#' + productName).outgoers().nodes().forEach(removeOneUsageFunc);
                    //TODO: this leave unused edges in the cy object.
                    that.cy.remove(that.cy.nodes('#' + productName).incomers('[^displayCount], [displayCount = 0]').nodes('[usageCount = 0]'));
                    that.cy.remove(that.cy.nodes('#' + productName).outgoers('[^displayCount], [displayCount = 0]').nodes('[usageCount = 0]'));
                    that.cy.remove(that.cy.nodes('#' + productName + '[usageCount = 0]'));
                }
                //Trigger a layout update
                that.cy.layout();
            });
        }
        graphController.$inject = [
            '$scope',
            '$rootScope',
            'factorioGraph'
        ];
        return graphController;
    })();
    FactorioVisualAngular.graphController = graphController;
})(FactorioVisualAngular || (FactorioVisualAngular = {}));
//# sourceMappingURL=factoriovisual-angular.js.map