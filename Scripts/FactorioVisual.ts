/// <reference path="typings/jquery/jquery.d.ts" />
/// <reference path="typings/cytoscape.d.ts" />
/// <reference path="typings/zip.js.d.ts" />
/// <reference path="typings/toastr/toastr.d.ts" />
/// <reference path="factoriovisual-angular.ts" />

class FactorioVisual {
    constructor() {
        this.factorioFolder = '/factorio/';
        this.factorioModFolder = this.factorioFolder + 'mods/';
        this.data = {};
        this.ZipContainer = {};
        this.dataLoadedPromise = jQuery.Deferred();

    }
    dataLoadedPromise: JQueryDeferred<any>;
    factorioFolder: string;
    factorioModFolder: string;
    data: any;
    ZipContainer: {
        [zipArchive: string]: {
            files: { [fileName: string]: string },
            entries: zip.Entry[]
        }
    };
    loadedMods: { mods: { name: string, enabled: string, Folder: string, Dependencies: any, Info: any }[] };
    //cyOfMods: Cy.Instance;
    loadModList() {
        var that = factorio;

        var loadModListPromise = jQuery.Deferred();

        toastr.options.timeOut = 0;
        toastr.info("loading game modules");
        loadModListPromise.then(function () {
            toastr.clear();
            toastr.options.timeOut = 30;
            toastr.success("loading game modules");
        });
        loadModListPromise.fail(function () {
            toastr.clear();
            toastr.options.timeOut = 30;
            toastr.error("loading game modules");
        });

        var modListConfigPromise = $.ajax({
            type: 'GET',
            url: that.factorioModFolder + 'mod-list.json',
            dataType: 'json',
            data: {},
            async: true
        });

        var availableModList = $.ajax({
            type: 'GET',
            url: that.factorioModFolder,
            data: {},
            async: true
        });

        jQuery.when.apply(jQuery, [modListConfigPromise, availableModList]).then(function () {
            var modListConfig = modListConfigPromise.responseJSON;

            var availableModListDom = jQuery(availableModList.responseText);
            var links = availableModListDom.find('a'); //jquery get all hyperlinks

            var modListPromises: JQueryPromise<any>[] = [];
            $(links).each(function (i, link) {
                var linkHref = $(link).attr('href');
                if (linkHref.length > 5 && linkHref.indexOf('DisableMods') == -1 && (
                    //if absolut link then beneth the modfolder
                    linkHref[0] != '/' || linkHref.indexOf(that.factorioModFolder) >= 0)) {
                    var thisModPromise: JQueryPromise<any> = undefined;
                    var thisModFolder = linkHref.replace(that.factorioModFolder, '').replace('/', '');

                    if (linkHref.slice(-1) == '/') {
                        var thisModDeferred = jQuery.Deferred();
                        thisModPromise = thisModDeferred.promise();
                        $.ajax({
                            type: 'GET',
                            url: that.factorioModFolder + thisModFolder + '/info.json',
                            dataType: 'json',
                            success: function (thisModConfigJson) {
                                //var thisModConfigJson = thisModConfig.responseJSON;
                                $(modListConfig.mods).each(function (i, mod) {
                                    if (mod['name'] == thisModConfigJson.name) {
                                        mod['Folder'] = thisModFolder;
                                        mod['Dependencies'] = thisModConfigJson.dependencies;
                                        mod['Info'] = thisModConfigJson;
                                        thisModDeferred.resolve();
                                        //break each
                                        return false;
                                    }
                                });
                            },
                            data: {},
                            async: true
                        });

                    } else if (linkHref.slice(-4) == '.zip') {
                        var thisModDeferred = jQuery.Deferred();
                        thisModPromise = thisModDeferred.promise();
                        zip.createReader(new zip.HttpReader(that.factorioModFolder + thisModFolder), function (zipReader) {
                            zipReader.getEntries(function (entries) {
                                that.ZipContainer[thisModFolder] = { entries: [], files: {} };
                                that.ZipContainer[thisModFolder].entries = entries;

                                var thisModSubPromises: JQueryPromise<any>[] = [];
                                entries.forEach(function (entry) {
                                    if (entry.filename.indexOf('info.json') >= 0) {
                                        var thisModSubDeferred = jQuery.Deferred();
                                        thisModSubPromises.push(thisModSubDeferred.promise());
                                        entry.getData(new zip.TextWriter(), function (text) {
                                            // text contains the entry data as a String
                                            var thisModConfigJson = JSON.parse(text);
                                            $(modListConfig.mods).each(function (i, mod) {
                                                if (mod['name'] == thisModConfigJson.name) {
                                                    mod['Folder'] = thisModFolder;
                                                    mod['Dependencies'] = thisModConfigJson.dependencies;
                                                    mod['Info'] = thisModConfigJson;
                                                    thisModSubDeferred.resolve();
                                                    //break each
                                                    return false;
                                                }
                                            });
                                        });

                                    } else if (entry.filename.indexOf('.lua') >= 0) {
                                        var thisModSubDeferred = jQuery.Deferred();
                                        thisModSubPromises.push(thisModSubDeferred.promise());
                                        entry.getData(new zip.TextWriter(), function (text) {
                                            that.ZipContainer[thisModFolder].files[entry.filename] = text;
                                            thisModSubDeferred.resolve();
                                        });
                                    } else if (entry.filename.indexOf('.png') >= 0) {
                                        var thisModSubDeferred = jQuery.Deferred();
                                        thisModSubPromises.push(thisModSubDeferred.promise());
                                        entry.getData(new zip.Data64URIWriter('image/png'), function (text) {
                                            that.ZipContainer[thisModFolder].files[entry.filename] = text;
                                            thisModSubDeferred.resolve();
                                        });
                                    }
                                });

                                jQuery.when.apply(jQuery, thisModSubPromises).then(function () {
                                    thisModDeferred.resolve();
                                });
                            });
                        });
                    }
                    if (thisModPromise != undefined) {
                        modListPromises.push(thisModPromise);
                    }
                }
            });

            jQuery.when.apply(jQuery, modListPromises).then(function () {
                var nodes: Cy.NodeDefinition[] = [];
                var edges: Cy.EdgeDefinition[] = [];
                //nodes.push({
                //    classes: 'mods',
                //    data: {
                //        id: 'mods',
                //        name: 'Game modules'
                //    }
                //});
                $(modListConfig.mods).each(function (i, mod) {
                    nodes.push({
                        classes: 'mod',
                        data: {
                            id: mod['name'],
                            name: mod['name'],
                            //parent: 'mods',
                            index: i
                        }
                    });
                    if (mod['Dependencies']) {
                        mod['Dependencies'].forEach(function (dependency: string) {
                            var splitted = dependency.split(' ', 3);
                            var dependend_modname = splitted[0];
                            var dependend_optinal = false;
                            if (splitted[0] == '?') {
                                dependend_modname = splitted[1];
                                dependend_optinal = true;
                            }
                            edges.push({
                                class: 'mod',
                                data: { source: dependend_modname, target: mod['name'], optinal: dependend_optinal }
                            });
                        });
                    }
                });
                var cyOfMods = cytoscape({
                    headless: true,
                    elements: {
                        nodes: nodes,
                        edges: edges
                    },
                    ready: function () {
                        var sortedByDependencyModListConfig = { mods: [] };
                        var loadedMods = cyOfMods.collection();
                        var iteratethoughNodes = function (node: Cy.CollectionElements) {
                            var modName = node.id();
                            var neededMods = node.connectedEdges().sources().not(node).not(loadedMods)
                            neededMods.forEach(iteratethoughNodes);
                            if (!node.anySame(loadedMods)) {
                                sortedByDependencyModListConfig.mods.push(modListConfig.mods[node.data('index')]);
                                loadedMods = loadedMods.add(node);
                            }
                            node.connectedEdges().targets().not(loadedMods).forEach(iteratethoughNodes);
                        }

                        cyOfMods.nodes().roots().forEach(iteratethoughNodes);

                        that.loadedMods = sortedByDependencyModListConfig;
                        loadModListPromise.resolve(JSON.stringify(sortedByDependencyModListConfig));
                    }
                });
            });
        });

        return loadModListPromise.promise();
    }
    loadFileFromZip(zipPackage, filename) {
        var that = factorio;
        //console.log(zipPackage);
        //console.log(filename);

        var luaFiles = that.ZipContainer[zipPackage].files;
        var luaFileContent: string = undefined;
        for (var luaFileName in luaFiles) {
            if (luaFileName.indexOf(filename) >= 0) {
                luaFileContent = luaFiles[luaFileName];
                break;
            }
        }

        if (luaFileContent == undefined) {
            if (filename.indexOf('data.lua') >= 0)
                return undefined;
            else
                throw 'File not found'
        }

        return luaFileContent;
    }

    jsonUpdated() {
        var that = factorio;
        //window.setTimeout(factorio.createRecipeGraph, 10);
        that.dataLoadedPromise.resolveWith(that.data);
    }

    iconConfigToURI(icon: string): string {
        icon = icon.replace('__base__', factorio.factorioFolder + 'data/base');
        icon = icon.replace('__core__', factorio.factorioFolder + 'data/core');
        if (icon.indexOf('__') == -1) {
            return icon;
        }

        for (var key in factorio.loadedMods.mods) {
            var mod = factorio.loadedMods.mods[key];
            var modIconReplacePattern = '__' + mod.name + '__';
            if (mod.name != 'base' && icon.indexOf(modIconReplacePattern) == 0) {
                if (mod.Folder.indexOf('.zip') > 0) {
                    //icon = factorio.factorioFolder + 'data/base/graphics/terrain/blank.png'
                    icon = icon.replace(modIconReplacePattern, '');
                    icon = factorio.loadFileFromZip(mod.Folder, icon);
                } else {
                    icon = icon.replace(modIconReplacePattern, factorio.factorioModFolder + mod.Folder);
                }
            }
            if (icon.indexOf('__') == -1) {
                return icon;
            }
        }

        return icon;

    }

    cyOfRecipe: Cy.Instance;
    createRecipeGraph() {
        var that = factorio;

        var nodes: Cy.NodeDefinition[] = [];
        var edges: Cy.EdgeDefinition[] = [];

        var recipes: {
            [recipeName: string]: {
                enabled: string,
                category?: string,
                energy_required?: number,
                ingredients: {
                    amount?: number,
                    name?: string,
                    type?: string,
                    /**
                     * 1 - name, 2 - amount
                     */
                    [index: number]: any
                }[],
                name: string,
                result: string,
                result_count?: number,
                subgroup?: string
            }
        };
        recipes = that.data.recipe;

        var productToNode: {
            [productName: string]: Cy.NodeDefinition[]
        } = {};

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
                    icon: that.factorioFolder + 'data/base/graphics/terrain/blank.png'
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
                            icon: that.factorioFolder + 'data/base/graphics/terrain/blank.png'
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
                            target: recipe.name
                        }
                    })
                }
            }
        }

        //Find icon for Products
        for (var key in that.data) {
            //if (key != 'recipe') {
            var dataGroup = that.data[key];
            for (var key in dataGroup) {
                var dataElement = dataGroup[key];
                if (dataElement.icon != undefined) {
                    var products = productToNode[dataElement.name];
                    if (products != undefined) {
                        for (var key in products) {
                            var product = products[key];
                            product.data['icon'] = that.iconConfigToURI(dataElement.icon);
                        }
                    }
                }
            }
            //}
        }

        that.cyOfRecipe = cytoscape({
            container: document.getElementById('cy-Recipe'),
            elements: {
                nodes: nodes,
                edges: edges
            }, layout: {
                name: 'breadthfirst',

                fit: true, // whether to fit the viewport to the graph
                directed: false, // whether the tree is directed downwards (or edges can point in any direction if false)
                padding: 100, // padding on fit
                
                circle: false, // put depths in concentric circles if true, put depths top down if false
                spacingFactor: 1.75, // positive spacing factor, larger => more space between nodes (N.B. n/a if causes overlap)
                boundingBox: undefined, // constrain layout bounds; { x1, y1, x2, y2 } or { x1, y1, w, h }
                avoidOverlap: true, // prevents node overlap, may overflow boundingBox if not enough space
                roots: undefined, // the roots of the trees
                maximalAdjustments: 0, // how many times to try to position the nodes in a maximal way (i.e. no backtracking)
                animate: false, // whether to transition the node positions
                animationDuration: 500, // duration of animation in ms if enabled
                ready: undefined, // callback on layoutready
                stop: undefined // callback on layoutstop
            },
            minZoom: 0.2,
            maxZoom: 2,
            style: [
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
                }]
        });
    }
}
var factorio = new FactorioVisual();