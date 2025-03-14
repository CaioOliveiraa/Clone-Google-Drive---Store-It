'use server'

import { createAdminClient } from "../appwrite";
import { InputFile } from "node-appwrite/file";
import { appwriteConfig } from "@/lib/appwrite/config";
import { ID, Models, Query} from "node-appwrite";
import { constructFileUrl, getFileType, parseStringify } from "@/lib/utils";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "./user.actions";

const handleError = (error: unknown, message: string) => {
    console.log(error, message);
    throw error;
};

export const uploadFile = async ({file, ownerId, accountId, path} : UploadFileProps) => {
    const {storage, databases} = await createAdminClient();

    try {
        
        const inputFile = InputFile.fromBuffer(file, file.name);

        const bucketFile = await storage.createFile(appwriteConfig.bucketId, ID.unique(), inputFile)

        const fileDocument = {
            type: getFileType(bucketFile.name).type,
            name: bucketFile.name,
            url: constructFileUrl(bucketFile.$id),
            extension: getFileType(bucketFile.name).extension,
            size: bucketFile.sizeOriginal,
            owner: ownerId,
            accountId,
            users: [],
            bucketFileId: bucketFile.$id,
        }

        const newFile = await databases
        .createDocument(
            appwriteConfig.databaseId,
            appwriteConfig.filesCollectionId,
            ID.unique(),
            fileDocument,
        )
        .catch(async (error: unknown) => {
            await storage.deleteFile(appwriteConfig.bucketId, bucketFile.$id);
            handleError(error,"Failed to create file document")
        });

        revalidatePath(path);
        return parseStringify(newFile);

    } catch (error) {
        handleError(error, "Failed to upload file");
    }
};

const createQueries = (currentUser: Models.Document) => {
    const queries = [
        Query.or([
            Query.equal("owner", [currentUser.$id]),
            Query.contains("users", [currentUser.email]),
        ]),
    ];

    return queries;
};

export const getFiles = async () => {
    const {databases} = await createAdminClient();
    
    try {
        const currentUser = await getCurrentUser();

        if(!currentUser) throw new Error("User not found");

        const queries = createQueries(currentUser);


        const files = await databases.listDocuments(
            appwriteConfig.databaseId,
            appwriteConfig.filesCollectionId,
            queries,
        );

        // console.log(currentUser, queries);        
        return parseStringify(files);

    } catch (error) {
        handleError(error, "Failed to get files");
    }
};

export const renameFile = async ({fileId, name, extension, path}: RenameFileProps) => {
    const {databases} = await createAdminClient();

    try {
        const newName = `${name}.${extension}`;
        const updatedfile = await databases.updateDocument(
            appwriteConfig.databaseId,
            appwriteConfig.filesCollectionId,
            fileId,
            {
                name: newName,
            },
        );

        revalidatePath(path);
        return parseStringify(updatedfile);
        
    } catch (error) {
        handleError(error, "Failed to rename file");
    }
}

export const updateFileUsers = async ({fileId, emails, path}: UpdateFileUsersProps) => {
    const {databases} = await createAdminClient();

    try {
        const updatedfile = await databases.updateDocument(
            appwriteConfig.databaseId,
            appwriteConfig.filesCollectionId,
            fileId,
            {
                users: emails,
            },
        );

        revalidatePath(path);
        return parseStringify(updatedfile);
        
    } catch (error) {
        handleError(error, "Failed to update file users");
    }
}

export const deleteFile = async ({fileId, bucketFileId, path}: DeleteFileProps) => {
    const {databases, storage} = await createAdminClient();

    try {
        const deletedFile = await databases.deleteDocument(
            appwriteConfig.databaseId,
            appwriteConfig.filesCollectionId,
            fileId,
        );

        if(deletedFile) await storage.deleteFile(appwriteConfig.bucketId, bucketFileId);

        revalidatePath(path);
        return parseStringify("success");
        
    } catch (error) {
        handleError(error, "Failed to delete file");
    }
}
