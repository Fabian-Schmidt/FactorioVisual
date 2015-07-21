/// <reference path="typings/jquery/jquery.d.ts" />
/// <reference path="typings/cytoscape.d.ts" />
/// <reference path="typings/zip.js.d.ts" />

class FactorioVisual {
    constructor() {
        this.factorioFolder = '/factorio/';
        this.json = '';
        this.data = {};
        this.ZipContainer = {};
    }
    factorioFolder: string;
    json: any;
    data: any;
    ZipContainer: {
        [zipArchive: string]: {
            files: { [fileName: string]: string },
            entries: zip.Entry[]
        }
    };
    loadedMods: { mods: { name: string, enabled: string, Folder: string, Dependencies: any, Info: any }[] };
    cyOfMods: Cy.Instance;
    loadModList() {
        var that = factorio;
        that.ZipContainer = {};

        var modFolder = that.factorioFolder + 'mods/';

        var promise = jQuery.Deferred();

        var modListConfigPromise = $.ajax({
            type: 'GET',
            url: modFolder + 'mod-list.json',
            dataType: 'json',
            success: function (modListConfig) { },
            data: {},
            async: true
        });

        var availableModList = $.ajax({
            type: 'GET',
            url: modFolder,
            success: function () {
                var availableModListDom = jQuery(availableModList.responseText);
                var links = availableModListDom.find('a'); //jquery get all hyperlinks
                modListConfigPromise.then(function (modListConfig) {
                    var modListPromises: JQueryDeferred<any>[] = [];
                    $(links).each(function (i, link) {
                        var linkHref = $(link).attr('href');
                        if (linkHref.length > 5 && linkHref.indexOf('DisableMods') == -1) {
                            var thisModPromise = undefined;
                            var thisModFolder = linkHref.replace(modFolder, '').replace('/', '');

                            if (linkHref.slice(-1) == '/') {
                                thisModPromise = $.ajax({
                                    type: 'GET',
                                    url: modFolder + thisModFolder + '/info.json',
                                    dataType: 'json',
                                    success: function (thisModConfigJson) {
                                        //var thisModConfigJson = thisModConfig.responseJSON;
                                        $(modListConfig.mods).each(function (i, mod) {
                                            if (mod['name'] == thisModConfigJson.name) {
                                                mod['Folder'] = thisModFolder;
                                                mod['Dependencies'] = thisModConfigJson.dependencies;
                                                mod['Info'] = thisModConfigJson;
                                                //break each
                                                return false;
                                            }
                                        });
                                    },
                                    data: {},
                                    async: true
                                });

                            } else if (linkHref.slice(-4) == '.zip') {
                                thisModPromise = jQuery.Deferred();
                                zip.createReader(new zip.HttpReader(modFolder + thisModFolder), function (zipReader) {
                                    zipReader.getEntries(function (entries) {
                                        that.ZipContainer[thisModFolder] = { entries: [], files: {} };
                                        that.ZipContainer[thisModFolder].entries = entries;
                                        var infoJson = undefined;
                                        entries.forEach(function (entry) {
                                            //console.log(entry.filename);
                                            if (!entry.directory && entry.filename.indexOf('info.json') >= 0) {
                                                infoJson = entry;
                                                //break forEach
                                                return false;
                                            }
                                        });

                                        var thisModSubPromises: JQueryDeferred<any>[] = [];
                                        that.ZipContainer[thisModFolder].files = {};
                                        entries.forEach(function (entry) {
                                            if (!entry.directory && (entry.filename.indexOf('.lua') >= 0 || entry.filename.indexOf('.png') >= 0)) {
                                                var thisModSubPromise = jQuery.Deferred();
                                                thisModSubPromises.push(thisModSubPromise);
                                                entry.getData(new zip.TextWriter(), function (text) {
                                                    that.ZipContainer[thisModFolder].files[entry.filename] = text;
                                                    thisModSubPromise.resolve();
                                                });
                                            }
                                        });

                                        infoJson.getData(new zip.TextWriter(), function (text) {
                                            // text contains the entry data as a String
                                            //console.log(text);
                                            var thisModConfigJson = JSON.parse(text);
                                            $(modListConfig.mods).each(function (i, mod) {
                                                if (mod['name'] == thisModConfigJson.name) {
                                                    mod['Folder'] = thisModFolder;
                                                    mod['Dependencies'] = thisModConfigJson.dependencies;
                                                    mod['Info'] = thisModConfigJson;
                                                    //break each
                                                    return false;
                                                }
                                            });
                                            jQuery.when.apply(jQuery, thisModSubPromises).then(function () {
                                                thisModPromise.resolve();
                                            });
                                        });
                                    });
                                });
                            }
                            modListPromises.push(thisModPromise);
                        }
                    });
                    jQuery.when.apply(jQuery, modListPromises).then(function () {
                        var nodes: Cy.NodeDefinition[] = [];
                        var edges: Cy.EdgeDefinition[] = [];
                        nodes.push({
                            classes: 'mods',
                            data: {
                                id: 'mods',
                                name: 'Game modules'
                            }
                        });
                        $(modListConfig.mods).each(function (i, mod) {
                            nodes.push({
                                classes: 'mod',
                                data: {
                                    id: mod['name'],
                                    name: mod['name'],
                                    parent: 'mods',
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

                        that.cyOfMods = cytoscape({
                            container: document.getElementById('cy-Mods'),
                            elements: {
                                nodes: nodes,
                                edges: edges
                            },
                            ready: function () {
                                var newModListConfig = { mods: [] };
                                var loadedMods = that.cyOfMods.collection();
                                var iteratethoughNodes = function (node: Cy.CollectionElements) {
                                    var modName = node.id();
                                    var neededMods = node.connectedEdges().sources().not(node).not(loadedMods)
                                    neededMods.forEach(iteratethoughNodes);
                                    if (!node.anySame(loadedMods)) {
                                        newModListConfig.mods.push(modListConfig.mods[node.data('index')]);
                                        loadedMods = loadedMods.add(node);
                                    }
                                    node.connectedEdges().targets().not(loadedMods).forEach(iteratethoughNodes);
                                }

                                that.cyOfMods.nodes('.mod').roots().forEach(iteratethoughNodes);

                                that.loadedMods = newModListConfig;

                                promise.resolve(JSON.stringify(newModListConfig));
                            },
                            style: [
                                {
                                    selector: 'node',
                                    css: {
                                        'content': 'data(name)'
                                        //'shape': 'rectangle',
                                        //'text-valign': 'center',
                                        //'text-halign': 'center',
                                        //'background-image'
                                    }
                                },
                                {
                                    selector: '$node > node',
                                    css: {
                                        'padding-top': '10px',
                                        'padding-left': '10px',
                                        'padding-bottom': '10px',
                                        'padding-right': '10px',
                                        'text-valign': 'top',
                                        'text-halign': 'center'
                                    }
                                },
                                {
                                    selector: 'edge',
                                    css: {
                                        'target-arrow-shape': 'triangle'
                                    }
                                },
                                {
                                    selector: ':selected',
                                    css: {
                                        'background-color': 'black',
                                        'line-color': 'black',
                                        'target-arrow-color': 'black',
                                        'source-arrow-color': 'black'
                                    }
                                }
                            ],
                            //layout: {
                            //    name: 'cose',
                            //    padding: 25
                            //}
                            //layout: {
                            //    name: 'concentric',
                            //    concentric: function (node) { // returns numeric value for each node, placing higher nodes in levels towards the centre
                            //        return node.degree();
                            //    },
                            //    levelWidth: function (nodes) { // the variation of concentric values in each level
                            //        return nodes.maxDegree() / 4;
                            //    }
                            //}
                            layout: {
                                name: 'breadthfirst',

                                fit: true, // whether to fit the viewport to the graph
                                directed: false, // whether the tree is directed downwards (or edges can point in any direction if false)
                                padding: 30, // padding on fit
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
                            }
                        });



                    });
                });
            },
            data: {},
            async: true
        });

        return promise.promise();
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
        //this.data = jQuery.parseJSON(this.factorio.json);
        //alert('data loaded');
        window.setTimeout(factorio.createRecipeGraph, 10);
    }

    iconConfigToURI(icon: string): string {
        icon = icon.replace('__base__', factorio.factorioFolder + 'data/base');
        if (icon.indexOf('__') == -1) {
            return icon;
        }

        for (var key in factorio.loadedMods.mods) {
            var mod = factorio.loadedMods.mods[key];
            if (mod.name != 'base' && icon.indexOf('__' + mod.name + '__') == 0) {
                if (mod.Folder.indexOf('.zip') > 0) {
                    icon = icon.replace('__' + mod.name + '__', '');
                    var data = Base64.encode(factorio.loadFileFromZip(mod.Folder, icon));
                    icon = 'data:image/png;base64,' + data;
                } else {
                    icon = icon.replace('__' + mod.name + '__', factorio.factorioFolder + 'mods/' + mod.Folder);
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
            if (key != 'recipe') {
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
            }
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

/**
*
*  Base64 encode / decode
*  http://www.webtoolkit.info/
*
**/
var Base64 = {

    // private property
    _keyStr: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=",

    // public method for encoding
    encode: function (input) {
        var output = "";
        var chr1, chr2, chr3, enc1, enc2, enc3, enc4;
        var i = 0;

        input = Base64._utf8_encode(input);

        while (i < input.length) {

            chr1 = input.charCodeAt(i++);
            chr2 = input.charCodeAt(i++);
            chr3 = input.charCodeAt(i++);

            enc1 = chr1 >> 2;
            enc2 = ((chr1 & 3) << 4) | (chr2 >> 4);
            enc3 = ((chr2 & 15) << 2) | (chr3 >> 6);
            enc4 = chr3 & 63;

            if (isNaN(chr2)) {
                enc3 = enc4 = 64;
            } else if (isNaN(chr3)) {
                enc4 = 64;
            }

            output = output +
            this._keyStr.charAt(enc1) + this._keyStr.charAt(enc2) +
            this._keyStr.charAt(enc3) + this._keyStr.charAt(enc4);

        }

        return output;
    },

    // public method for decoding
    decode: function (input) {
        var output = "";
        var chr1, chr2, chr3;
        var enc1, enc2, enc3, enc4;
        var i = 0;

        input = input.replace(/[^A-Za-z0-9\+\/\=]/g, "");

        while (i < input.length) {

            enc1 = this._keyStr.indexOf(input.charAt(i++));
            enc2 = this._keyStr.indexOf(input.charAt(i++));
            enc3 = this._keyStr.indexOf(input.charAt(i++));
            enc4 = this._keyStr.indexOf(input.charAt(i++));

            chr1 = (enc1 << 2) | (enc2 >> 4);
            chr2 = ((enc2 & 15) << 4) | (enc3 >> 2);
            chr3 = ((enc3 & 3) << 6) | enc4;

            output = output + String.fromCharCode(chr1);

            if (enc3 != 64) {
                output = output + String.fromCharCode(chr2);
            }
            if (enc4 != 64) {
                output = output + String.fromCharCode(chr3);
            }

        }

        output = Base64._utf8_decode(output);

        return output;

    },

    // private method for UTF-8 encoding
    _utf8_encode: function (string) {
        string = string.replace(/\r\n/g, "\n");
        var utftext = "";

        for (var n = 0; n < string.length; n++) {

            var c = string.charCodeAt(n);

            if (c < 128) {
                utftext += String.fromCharCode(c);
            }
            else if ((c > 127) && (c < 2048)) {
                utftext += String.fromCharCode((c >> 6) | 192);
                utftext += String.fromCharCode((c & 63) | 128);
            }
            else {
                utftext += String.fromCharCode((c >> 12) | 224);
                utftext += String.fromCharCode(((c >> 6) & 63) | 128);
                utftext += String.fromCharCode((c & 63) | 128);
            }

        }

        return utftext;
    },

    // private method for UTF-8 decoding
    _utf8_decode: function (utftext) {
        var string = "";
        var i = 0;
        var c1;
        var c2;
        var c = c1 = c2 = 0;

        while (i < utftext.length) {

            c = utftext.charCodeAt(i);

            if (c < 128) {
                string += String.fromCharCode(c);
                i++;
            }
            else if ((c > 191) && (c < 224)) {
                c2 = utftext.charCodeAt(i + 1);
                string += String.fromCharCode(((c & 31) << 6) | (c2 & 63));
                i += 2;
            }
            else {
                c2 = utftext.charCodeAt(i + 1);
                var c3 = utftext.charCodeAt(i + 2);
                string += String.fromCharCode(((c & 15) << 12) | ((c2 & 63) << 6) | (c3 & 63));
                i += 3;
            }

        }

        return string;
    }

}