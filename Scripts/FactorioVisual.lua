currentLoadingMod = nil

-- Make window object a global
window = js.global;
factorioFolder = js.global.factorio.factorioFolder

do -- Create js.ipairs and js.pairs functions. attach as __pairs and __ipairs on JS userdata objects.
	local _PROXY_MT = debug.getregistry()._PROXY_MT

	-- Iterates from 0 to collection.length-1
	local function js_inext(collection, i)
		i = i + 1
		if i >= collection.length then return nil end
		return i, collection[i]
	end
	function js.ipairs(collection)
		return js_inext, collection, -1
	end
	_PROXY_MT.__ipairs = js.ipairs

	function js.pairs(ob)
		local keys = js.global.Object:getOwnPropertyNames(ob) -- Should this be Object.keys?
		local i = 0
		return function(ob, last)
			local k = keys[i]
			i = i + 1;
			return k, ob[k]
		end, ob, nil
	end
	_PROXY_MT.__pairs = js.pairs
end

-- Set up require paths to be sensible for the browser
local function load_lua_over_http(url)
	local xhr = js.new(window.XMLHttpRequest)
	xhr:open("GET", url, false) -- Synchronous
	-- Need to pcall xhr:send(), as it can throw a NetworkError if CORS fails
	local ok, err = pcall(xhr.send, xhr)
	if not ok then
		return nil, tostring(err)
	elseif xhr.status ~= 200 then
		return nil, "HTTP GET " .. xhr.statusText .. ": " .. url
	end
	return load(xhr.responseText, url)
end
package.path = ""
package.cpath = ""

for k in pairs (package.searchers) do
	package.searchers[k] = nil
end
table.insert(package.searchers, function (mod_name)
	--print ('Searching for module: ' .. mod_name)
	local full_url = mod_name:gsub("([^\\])%.", "%1/"):gsub("\\%.", ".") .. ".lua"
	if full_url:match('%.zip/') then
		local zipArchive = full_url:gsub('%.zip/.+', '.zip')
		local zipFile = full_url:gsub('.+%.zip/', '/')
		--print ('load zip: ' .. zipArchive .. ' file: ' .. zipFile)
		local zipFileContent = js.global.factorio.loadFileFromZip(nil, zipArchive, zipFile)
		local func = load(zipFileContent, full_url);
		if func ~= nil then return func end
		local err = 'Can not load ' .. full_url;
		
		return "\n    " .. err .. "\n    " --.. err2
	else
		local func, err = load_lua_over_http(full_url)
		if func ~= nil then return func end
		
		return "\n    " .. err .. "\n    " --.. err2
	end
	
end)

if oldRequire == nil then
	oldRequire = require
	require = function(mod_name)
		if mod_name == "dkjson" then
			mod_name = 'Scripts.' .. mod_name;
		else
			local modFolder = 'mods'
			if currentLoadingMod == 'core' or currentLoadingMod == 'base' then
				modFolder = 'data'
			end
			if mod_name == "util" or mod_name == "defines" or mod_name == "autoplace_utils" or mod_name == "dataloader" then
				mod_name = factorioFolder .. 'data.core.lualib.' .. mod_name
			elseif currentLoadingMod:match('%.zip$') then
				mod_name = currentLoadingMod .. '/' .. mod_name
			else
				mod_name = factorioFolder .. modFolder .. '.' .. currentLoadingMod .. '.' .. mod_name;
			end
		end
		--print ('Loading module: ' .. mod_name)
		return oldRequire(mod_name)
	end
end
currentLoadingMod = 'core'
dataloader = require("dataloader")
util = require("util")
defines = require("defines")
autoplace_utils = require("autoplace_utils")

--data.isdemo = true

--load mods
local modListPromise = js.global.factorio.loadModList()

local modListLoaded = function(object, modListTxt)
  local json = require ("dkjson")
  local modList = json.decode(modListTxt)
  
  for modkey,modvalue in pairs(modList.mods) do
    if modvalue.enabled == 'true' then
      print (modvalue.name)
	  if modvalue.Folder ~= nil then
		currentLoadingMod = modvalue.Folder:gsub('%.', '\\.')
		pcall (function()
			local thisModData = require ("data")
		end)
	  elseif modvalue.name == 'base' then
		currentLoadingMod = modvalue.name
		require ("data")
	  end
    end
  end
  
  --transfer data to JavaScript
  transferToJs = function(jsObjectName, luaObject, buffer, buflen) 
	local valtype = type (luaObject)
	if luaObject == nil then
		
	elseif valtype == 'table' then
		for k,v in pairs(luaObject) do
			--print(k)
			--print(v)

			local jsObjectName2 = jsObjectName .. '["' .. k .. '"]'
			
			local val2type = type (v)
			if val2type == 'table' then
				buflen = buflen + 1
				buffer[buflen] = jsObjectName2
				buflen = buflen + 1
				buffer[buflen] = ' = {};'
			end
			--if v ~= nil then
			buflen = transferToJs(jsObjectName2, v, buffer, buflen);
			--end
		end
		
	elseif valtype == 'number' then
		buflen = buflen + 1
		buffer[buflen] = jsObjectName 
		buflen = buflen + 1
		buffer[buflen] = ' = '
		buflen = buflen + 1
		buffer[buflen] = tostring(luaObject)
		buflen = buflen + 1
		buffer[buflen] = ';'
	elseif valtype == 'boolean' then
		buflen = buflen + 1
		buffer[buflen] = jsObjectName
		if luaObject then
			buflen = buflen + 1
			buffer[buflen] = ' = true;'
		else
			buflen = buflen + 1
			buffer[buflen] = ' = false;'
		end
	elseif valtype == 'string' then
		buflen = buflen + 1
		buffer[buflen] = jsObjectName
		buflen = buflen + 1
		buffer[buflen] = ' = "'
		buflen = buflen + 1
		buffer[buflen] = luaObject
		buflen = buflen + 1
		buffer[buflen] = '";'
	else
		print ('cant convert ' .. valtype)
		--jsObject = luaObject;
	end
	return buflen
  end
  
  js.global:eval('factorio.data = {};');
  local buffer = {}
  local bufferlen = transferToJs('factorio.data',  data.raw, buffer, 0);
  local concat = table.concat
  js.global:eval(concat (buffer))
 

  js.global.factorio.jsonUpdated()
  print('lua done!')
end
--modListPromise.done(function() print('First callback does not work.') end,function() print('seconds callback does work.') end)
modListPromise.done(modListLoaded, modListLoaded);
