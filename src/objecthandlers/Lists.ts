/// <reference path="..\..\typings\tsd.d.ts" />
/// <reference path="ObjectHandlerBase.ts" />
/// <reference path="..\schema\IListInstance.ts" />

module Pzl.Sites.Core.ObjectHandlers {
    module Extensions {
        export function CreateFolders(clientContext : SP.ClientContext, listUrl: string, folders : Array<Schema.IFolder>) {
            var def = jQuery.Deferred();    
            var listRelativeUrl = `${_spPageContextInfo.webServerRelativeUrl}/${listUrl}`;
            var rootFolder = clientContext.get_web().getFolderByServerRelativeUrl(listRelativeUrl);
            var metadataDefaults = "<MetadataDefaults>";
            folders.forEach(f => {
                rootFolder.get_folders().add(`${listRelativeUrl}/${f.Name}`)
                if(f.DefaultValues) {
                    var keys = Object.keys(f.DefaultValues).length;
                    if(keys > 0) {
                        metadataDefaults += `<a href='${listRelativeUrl}/${f.Name}'>`;
                        Object.keys(f.DefaultValues).forEach(key => { metadataDefaults += `<DefaultValue FieldName="${key}">${f.DefaultValues[key]}</DefaultValue>`; });
                        metadataDefaults += "</a>";
                    }
                }
            });
            metadataDefaults += "</MetadataDefaults>";
            
            var metadataDefaultsFileCreateInfo = new SP.FileCreationInformation();
            metadataDefaultsFileCreateInfo.set_url(`${listRelativeUrl}/Forms/client_LocationBasedDefaults.html`);
            metadataDefaultsFileCreateInfo.set_content(new SP.Base64EncodedByteArray());
            metadataDefaultsFileCreateInfo.set_overwrite(true);
            for (var i = 0; i < metadataDefaults.length; i++) {
                metadataDefaultsFileCreateInfo.get_content().append(metadataDefaults.charCodeAt(i));
            }
            rootFolder.get_files().add(metadataDefaultsFileCreateInfo);
            def.resolve();
            
            return def.promise();
        }
        export function ApplyContentTypeBindings(clientContext : SP.ClientContext, list: SP.List, contentTypeBindings : Array<Schema.IContentTypeBinding>) {
            var def = jQuery.Deferred();    
            var webCts = clientContext.get_site().get_rootWeb().get_contentTypes();
            var listCts = list.get_contentTypes();
            
            Core.Log.Information("Lists Content Types", `Enabled content types for list '${list.get_title()}'`)
            list.set_contentTypesEnabled(true);
            list.update();
                        
            clientContext.load(webCts);
            clientContext.load(listCts);
            clientContext.executeQueryAsync(
                () => {      
                    contentTypeBindings.forEach(ctb => {
                        Core.Log.Information("Lists Content Types", `Adding content type '${ctb.ContentTypeId}' to list '${list.get_title()}'`)
                        listCts.addExistingContentType(webCts.getById(ctb.ContentTypeId));
                        
                    });
                    list.update();
                    def.resolve();   
                },
                (sender, args) => { 
                    console.log(sender, args);
                    def.resolve(sender, args);   
                });         
            
            return def.promise();
        }
        export function CreateViews() {
            
        }
    }
    
    export class Lists extends ObjectHandlerBase {
        constructor() {
            super("Lists")
        }
        ProvisionObjects(objects : Array<Schema.IListInstance>) {
            Core.Log.Information(this.name, `Starting provisioning of objects`);
            
            var def = jQuery.Deferred();            
 
            var clientContext = SP.ClientContext.get_current();
            var lists = clientContext.get_web().get_lists();
            var listInstances : Array<SP.List> = [];
            
            clientContext.load(lists);
            clientContext.executeQueryAsync(
                () => {      
                    objects.forEach((obj, index) => {
                        var existingObj : any = jQuery.grep(lists.get_data(), (list) => {
                            return list.get_title() == obj.Title;
                        })[0];                     
                        
                        if(existingObj) {                            
                            Core.Log.Information(this.name, `A list, survey, discussion board, or document library with the specified title '${obj.Title}' already exists in this Web site at Url '${obj.Url}'.`);
                            listInstances.push(existingObj);  
                            clientContext.load(listInstances[index]);
                        } else {
                            Core.Log.Information(this.name, `Creating list with Title '${obj.Title}' and Url '${obj.Url}'.`)
                            var objCreationInformation = new SP.ListCreationInformation();            
                            if(obj.Description) { objCreationInformation.set_description(obj.Description); }
                            if(obj.OnQuickLaunch) { objCreationInformation.set_quickLaunchOption(obj.OnQuickLaunch ? SP.QuickLaunchOptions.on : SP.QuickLaunchOptions.off); }
                            if(obj.TemplateType) { objCreationInformation.set_templateType(obj.TemplateType); }
                            if(obj.Title) { objCreationInformation.set_title(obj.Title); }
                            if(obj.Url) { objCreationInformation.set_url(obj.Url); }
                            listInstances.push(lists.add(objCreationInformation));
                            clientContext.load(listInstances[index]);
                        }
                    });
                    
                    if(!clientContext.get_hasPendingRequest()) {
                        Core.Log.Information(this.name, `Provisioning of objects ended`);
                        def.resolve();                        
                        return def.promise();
                    }
                    
                    clientContext.executeQueryAsync(
                        () => {      
                            var promises = [];
                            objects.forEach(function(obj, index) {
                                if(obj.Folders && obj.Folders.length > 0) {
                                    promises.push(Extensions.CreateFolders(clientContext, obj.Url, obj.Folders));
                                }
                                if(obj.ContentTypeBindings && obj.ContentTypeBindings.length > 0) {
                                    promises.push(Extensions.ApplyContentTypeBindings(clientContext, listInstances[index], obj.ContentTypeBindings));
                                }
                            });
                            jQuery.when.apply(jQuery, promises).done(() => {        
                                    clientContext.executeQueryAsync(
                                        () => {   
                                            Core.Log.Information(this, `Provisioning of objects ended`);
                                            def.resolve();
                                        });
                            });
                        }, 
                        (sender, args) => {
                            Core.Log.Information(this.name, `Provisioning of objects failed`)
                            Core.Log.Error(this.name, `${args.get_message()}`)
                            def.resolve(sender, args);
                        });
                }, 
                (sender, args) => {
                    Core.Log.Information(this.name, `Provisioning of objects failed`)
                    Core.Log.Error(this.name, `${args.get_message()}`)
                    def.resolve(sender, args);
                });      
                
            return def.promise();
        }
    } 
}